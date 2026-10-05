import { type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePrecacheWorker } from '../../../tools/build-precache';

const projectRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const fixturePath = resolve(projectRoot, 'tests/e2e/csp-fixtures/third-party.js');
const mimeTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

interface HeaderRule {
  pattern: string;
  name: string;
  value: string;
}

export interface CspTestServer {
  baseURL: string;
  close(): Promise<void>;
}

function parseHeaderRules(content: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let path = '';
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      continue;
    }

    const match = /^\s+([^:]+):\s*(.*)$/.exec(line);
    if (!path || !match?.[1] || match[2] === undefined) {
      throw new Error(`Invalid built _headers line: ${line}`);
    }
    rules.push({ pattern: path, name: match[1].toLowerCase(), value: match[2] });
  }
  return rules;
}

function headersForRequest(
  rules: readonly HeaderRule[],
  requestPath: string,
  requestHost: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of rules) {
    const absolutePattern = /^https:\/\/([^/]+)(\/.*)$/.exec(rule.pattern);
    const matchesAbsolute =
      absolutePattern?.[1]?.toLowerCase() === requestHost &&
      absolutePattern[2] !== undefined &&
      (absolutePattern[2] === '/*' ||
        requestPath.startsWith(absolutePattern[2].replace(/\\*$/, '')));
    if (rule.pattern === '/*' || rule.pattern === requestPath || matchesAbsolute) {
      headers[rule.name] = rule.value;
    }
  }
  return headers;
}

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function hasFixtureCookie(request: IncomingMessage): boolean {
  return (request.headers.cookie ?? '')
    .split(';')
    .some((cookie) => cookie.trim() === 'csp-fixture=third-party');
}

async function listen(server: Server, host: string, port: number): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('CSP test server did not bind TCP.');
  return address.port;
}

export async function startCspTestServer(
  buildDirectory = resolve(projectRoot, 'dist'),
  host = '127.0.0.1',
  port = 0,
): Promise<CspTestServer> {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The CSP test server may bind only to loopback.');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('The CSP test server port must be between 0 and 65535.');
  }

  const absoluteBuildDirectory = resolve(buildDirectory);
  const headerRules = parseHeaderRules(
    await readFile(resolve(absoluteBuildDirectory, '_headers'), 'utf8'),
  );
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'flo-csp-network-'));
  const fixtureBuildDirectory = resolve(temporaryRoot, 'fixture-build');
  const certificatePath = resolve(temporaryRoot, 'localhost.crt');
  const privateKeyPath = resolve(temporaryRoot, 'localhost.key');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        privateKeyPath,
        '-out',
        certificatePath,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    await cp(absoluteBuildDirectory, fixtureBuildDirectory, { recursive: true });
    const fixtureIndexPath = resolve(fixtureBuildDirectory, 'index.html');
    const index = await readFile(fixtureIndexPath, 'utf8');
    if (!/<\/body>/i.test(index))
      throw new Error('Built shell has no closing body tag for CSP fixture.');
    const withThirdPartyManifest = index.replace(
      /<link\s+rel="manifest"[^>]*>/i,
      '<link rel="manifest" href="https://csp-third-party.invalid/manifest.webmanifest" />',
    );
    if (withThirdPartyManifest === index) {
      throw new Error('Built shell has no manifest link for the synthetic CSP fixture.');
    }
    await writeFile(
      fixtureIndexPath,
      withThirdPartyManifest.replace(
        /<\/body>/i,
        '  <script src="/csp-fixtures/third-party.js"></script>\n</body>',
      ),
      'utf8',
    );
    const fixtureAssetPath = resolve(fixtureBuildDirectory, 'csp-fixtures/third-party.js');
    await mkdir(resolve(fixtureBuildDirectory, 'csp-fixtures'), { recursive: true });
    await cp(fixturePath, fixtureAssetPath);
    await writePrecacheWorker(fixtureBuildDirectory);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }

  const server = createServer(
    {
      key: await readFile(privateKeyPath),
      cert: await readFile(certificatePath),
    },
    (request, response) => {
      void (async () => {
        let requestUrl: URL;
        try {
          requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        } catch {
          send(response, 400, 'invalid request URL');
          return;
        }

        const fixtureRequested = requestUrl.searchParams.get('csp-fixture') === 'third-party';
        if (requestUrl.searchParams.has('csp-fixture') && !fixtureRequested) {
          send(response, 400, 'unknown synthetic CSP fixture');
          return;
        }
        const fixtureBuildSelected = fixtureRequested || hasFixtureCookie(request);
        const buildRoot = fixtureBuildSelected
          ? resolve(temporaryRoot, 'fixture-build')
          : absoluteBuildDirectory;
        let requestPath: string;
        try {
          requestPath = decodeURIComponent(
            requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname,
          );
        } catch {
          send(response, 400, 'invalid request path');
          return;
        }
        const filePath = resolve(buildRoot, `.${requestPath}`);
        let requestHost = '';
        try {
          requestHost = new URL(`https://${request.headers.host ?? ''}`).hostname.toLowerCase();
        } catch {
          send(response, 400, 'invalid request host');
          return;
        }
        if (!filePath.startsWith(`${buildRoot}${sep}`)) {
          send(response, 400, 'invalid request path');
          return;
        }

        try {
          const body = await readFile(filePath);
          const headers = {
            'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
            'content-length': String(body.byteLength),
            ...headersForRequest(headerRules, requestPath, requestHost),
          };
          if (fixtureRequested && requestPath === '/index.html') {
            response.writeHead(200, {
              ...headers,
              'set-cookie': 'csp-fixture=third-party; Path=/; SameSite=Lax',
            });
          } else {
            response.writeHead(200, headers);
          }
          response.end(body);
        } catch {
          send(response, 404, 'not found');
        }
      })().catch((error: unknown) => {
        send(response, 500, error instanceof Error ? error.message : String(error));
      });
    },
  );

  try {
    const boundPort = await listen(server, host, port);
    const displayHost = host === '::1' ? '[::1]' : host;
    return {
      baseURL: `https://${displayHost}:${boundPort}/`,
      close: async () => {
        await new Promise<void>((resolveClose, reject) => {
          server.close((error) => (error ? reject(error) : resolveClose()));
        });
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const portValue = process.env.CSP_SERVER_PORT ?? '0';
  const port = Number(portValue);
  const host = process.env.CSP_SERVER_HOST ?? '127.0.0.1';
  const buildDirectory = process.env.CSP_BUILD_DIR ?? resolve(projectRoot, 'dist');
  const server = await startCspTestServer(buildDirectory, host, port);
  process.stdout.write(`CSP_BASE_URL=${server.baseURL}\n`);
  const close = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
