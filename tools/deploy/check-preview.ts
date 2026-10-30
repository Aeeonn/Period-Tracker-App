import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const buildDirectory = resolve(tmpdir(), 'flo-preview-build', 'probe');
const probeTitle = 'Device feasibility probe';
const reservedPagesFiles = new Set(['_headers']);
const curlMetadata = '%{stderr}__FLO_HTTP__%{http_code}__FLO_TYPE__%{content_type}';

class PreviewUnavailableError extends Error {}
class ByteMismatchError extends Error {}

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

function isNetworkBlockPage(bytes: Buffer, contentType: string): boolean {
  const body = bytes.toString('utf8').toLowerCase();
  if (
    ['cisco umbrella', '146.112.61.', 'umbrella.cisco.com'].some((marker) => body.includes(marker))
  ) {
    return true;
  }
  return (
    contentType.toLowerCase().includes('text/html') &&
    body.includes('<html') &&
    !body.includes(probeTitle.toLowerCase())
  );
}

function fetchFile(url: URL, relativePath: string): Buffer {
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
  if (isNetworkBlockPage(bytes, contentType)) {
    throw new PreviewUnavailableError(
      `${relativePath}: preview returned non-probe HTML, likely a local network-filter block page.`,
    );
  }
  return bytes;
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument || process.argv.length !== 3) {
    throw new Error('Usage: npx tsx tools/deploy/check-preview.ts <preview-url>');
  }

  const origin = previewOrigin(argument);
  const files = (await listFiles(buildDirectory)).filter(
    (file) => !reservedPagesFiles.has(relative(buildDirectory, file).split(sep).join('/')),
  );
  if (
    files.length === 0 ||
    !files.some((file) => relative(buildDirectory, file) === 'index.html')
  ) {
    throw new Error(`Build output is empty or missing index.html: ${buildDirectory}`);
  }

  let compared = 0;
  for (const file of files) {
    const path = relative(buildDirectory, file).split(sep).join('/');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = path === 'index.html' ? origin : new URL(encodedPath, origin);
    const expected = await readFile(file);
    const served = fetchFile(url, path);

    if (!expected.equals(served)) {
      throw new ByteMismatchError(
        `${path}: served bytes differ (expected ${expected.length}, received ${served.length}); possible host rewrite or injected script.`,
      );
    }
    compared += 1;
  }

  const skippedConfig = reservedPagesFiles.has('_headers')
    ? ' (_headers is Pages configuration, not a served asset)'
    : '';
  console.log(`check-preview: PASS; ${compared} served files byte-equal${skippedConfig}.`);
}

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
  console.error(`check-preview: ERROR; ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
