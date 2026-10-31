import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PreviewEntry = 'probe' | 'app';

const reservedPagesFiles = new Set(['_headers']);
const curlMetadata = '%{stderr}__FLO_HTTP__%{http_code}__FLO_TYPE__%{content_type}';

class PreviewUnavailableError extends Error {}
class ByteMismatchError extends Error {}

export function previewBuildDirectory(entry: PreviewEntry): string {
  return resolve('/tmp/flo-preview-build', entry);
}

export function extractPageTitle(html: Buffer): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html.toString('utf8'))?.[1]?.trim();
  if (!title) throw new Error('Build output index.html is missing a non-empty <title>.');
  return title;
}

export function isNetworkBlockPage(
  bytes: Buffer,
  contentType: string,
  expectedPageTitle: string,
): boolean {
  const body = bytes.toString('utf8').toLowerCase();
  if (
    ['cisco umbrella', '146.112.61.', 'umbrella.cisco.com'].some((marker) => body.includes(marker))
  ) {
    return true;
  }
  return (
    contentType.toLowerCase().includes('text/html') &&
    body.includes('<html') &&
    !body.includes(expectedPageTitle.toLowerCase())
  );
}

export function isMissingAssetFallback(
  relativePath: string,
  contentType: string,
  bytes: Buffer,
  expectedPageTitle: string,
): boolean {
  const isHtmlPath = /\.html?$/iu.test(relativePath);
  const hasExpectedPageIdentity = bytes
    .toString('utf8')
    .toLowerCase()
    .includes(expectedPageTitle.toLowerCase());
  return (
    !isHtmlPath &&
    contentType.toLowerCase().includes('text/html') &&
    hasExpectedPageIdentity &&
    !isNetworkBlockPage(bytes, contentType, expectedPageTitle)
  );
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Unsupported build output entry: ${path}`);
    }
  }

  return files.sort();
}

function previewOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.pages.dev') ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Expected an HTTPS *.pages.dev origin without a path or credentials.');
  }
  return url;
}

interface PreviewResponse {
  readonly bytes: Buffer;
  readonly contentType: string;
}

function fetchFile(url: URL, relativePath: string): PreviewResponse {
  const result = spawnSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--compressed',
      '--fail-with-body',
      '--max-time',
      '20',
      '--proto',
      '=https',
      '--write-out',
      curlMetadata,
      '--output',
      '-',
      url.href,
    ],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  );

  if (result.error) {
    throw new PreviewUnavailableError(
      `${relativePath}: preview request failed (curl could not run).`,
    );
  }

  const diagnostics = result.stderr.toString('utf8');
  const status = diagnostics.match(/__FLO_HTTP__(\d{3})/u)?.[1];
  const contentType = diagnostics.match(/__FLO_TYPE__([^\r\n]*)/u)?.[1] ?? '';
  const bytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
  if (result.status !== 0 || status !== '200') {
    throw new PreviewUnavailableError(
      `${relativePath}: preview request unavailable (HTTP ${status ?? 'unknown'}, curl exit ${result.status ?? 'signal'}).`,
    );
  }
  return { bytes, contentType };
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument || process.argv.length < 3 || process.argv.length > 4) {
    throw new Error('Usage: npx tsx tools/deploy/check-preview.ts <preview-url> [probe|app]');
  }
  const entryArgument = process.argv[3] ?? 'probe';
  if (entryArgument !== 'probe' && entryArgument !== 'app') {
    throw new Error('Expected build entry "probe" or "app".');
  }
  const entry: PreviewEntry = entryArgument;
  const origin = previewOrigin(argument);
  const buildDirectory = previewBuildDirectory(entry);
  const files = (await listFiles(buildDirectory)).filter(
    (file) => !reservedPagesFiles.has(relative(buildDirectory, file).split(sep).join('/')),
  );
  const indexFile = join(buildDirectory, 'index.html');
  if (files.length === 0 || !files.includes(indexFile)) {
    throw new Error(`Build output is empty or missing index.html: ${buildDirectory}`);
  }

  const indexHtml = await readFile(indexFile);
  const expectedPageTitle = extractPageTitle(indexHtml);
  let compared = 0;
  for (const file of files) {
    const path = relative(buildDirectory, file).split(sep).join('/');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = path === 'index.html' ? origin : new URL(encodedPath, origin);
    const expected = file === indexFile ? indexHtml : await readFile(file);
    const response = fetchFile(url, path);

    if (isNetworkBlockPage(response.bytes, response.contentType, expectedPageTitle)) {
      throw new PreviewUnavailableError(
        `${path}: preview returned unexpected HTML, likely a local network-filter block page.`,
      );
    }
    if (isMissingAssetFallback(path, response.contentType, response.bytes, expectedPageTitle)) {
      throw new ByteMismatchError(
        `${path}: missing file (Pages returned the SPA index fallback for this asset).`,
      );
    }
    if (!expected.equals(response.bytes)) {
      throw new ByteMismatchError(
        `${path}: served bytes differ (expected ${expected.length}, received ${response.bytes.length}); possible host rewrite or injected script.`,
      );
    }
    compared += 1;
  }

  const skippedConfig = reservedPagesFiles.has('_headers')
    ? ' (_headers is Pages configuration, not a served asset)'
    : '';
  console.log(
    `check-preview: PASS; ${entry} build: ${compared} served files byte-equal${skippedConfig}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof PreviewUnavailableError) {
      console.error(`check-preview: PENDING; ${error.message}`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof ByteMismatchError) {
      console.error(`check-preview: FAIL; ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(
      `check-preview: ERROR; ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
