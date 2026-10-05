import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import {
  buildSecurityHeaders,
  validateCustomDomainOrigin,
  validateRelayOrigin,
} from '../../tools/build-security-headers';
import { startCspTestServer, type CspTestServer } from './csp-fixtures/server';
import type { EndpointPolicy } from './csp-fixtures/recorder';

test.use({
  ignoreHTTPSErrors:
    process.env.BASE_URL === undefined || process.env.CSP_IGNORE_HTTPS_ERRORS === 'true',
});

const endpointPolicyPath = resolve(process.cwd(), 'tools/allowed-endpoints.json');
const expectedPermissionsPolicy =
  'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()';
const approvedCspDirectiveNames = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'manifest-src',
  'worker-src',
  'media-src',
  'frame-ancestors',
  'base-uri',
  'form-action',
  'object-src',
  'require-trusted-types-for',
  'upgrade-insecure-requests',
];
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const controlCharacterPattern = /[\u0000-\u0020\u007f-\u009f]/;

function isDnsHostForTest(hostname: string): boolean {
  return (
    hostname.length <= 253 && hostname.split('.').every((label) => dnsLabelPattern.test(label))
  );
}

function isRelayOriginSafeForTest(value: string): boolean {
  if (controlCharacterPattern.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.origin === value &&
      (isDnsHostForTest(parsed.hostname) || /^\[[0-9a-f:.]+\]$/i.test(parsed.hostname))
    );
  } catch {
    return false;
  }
}

function isCustomDomainSafeForTest(value: string): boolean {
  if (!isRelayOriginSafeForTest(value)) return false;
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.port === '' &&
    isDnsHostForTest(host) &&
    host.includes('.') &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) &&
    host !== 'pages.dev' &&
    !host.endsWith('.pages.dev')
  );
}

function expectedCspPolicy(relayOrigin: string | undefined): string {
  const connectSource = `'self'${relayOrigin ? ` ${relayOrigin}` : ''}`;
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src ${connectSource}; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'; upgrade-insecure-requests`;
}

function assertCspStructure(policy: string, relayOrigin: string | undefined): void {
  const directives = policy.split(';').map((directive) => directive.trim());
  const names = directives.map((directive) => directive.split(/\s+/, 1)[0]);
  expect(names).toEqual(approvedCspDirectiveNames);
  expect(new Set(names).size).toBe(approvedCspDirectiveNames.length);
  expect(directives[5]).toBe(`connect-src 'self'${relayOrigin ? ` ${relayOrigin}` : ''}`);
  if (relayOrigin !== undefined) expect(isRelayOriginSafeForTest(relayOrigin)).toBe(true);
}
let localServer: CspTestServer | undefined;
let baseURL = '';

function configuredBaseURL(): string | undefined {
  const supplied = process.env.BASE_URL;
  if (supplied === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(supplied);
  } catch {
    throw new Error('BASE_URL must be an absolute HTTP(S) URL to a served build.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('BASE_URL must be an absolute HTTP(S) URL to a served build.');
  }
  return parsed.href;
}

async function readEndpointPolicy(): Promise<EndpointPolicy> {
  return JSON.parse(await readFile(endpointPolicyPath, 'utf8')) as EndpointPolicy;
}

async function exactResponseHeaders(
  page: Page,
  url: string,
  host?: string,
): Promise<Record<string, string>> {
  const response = await page.request.get(url, host ? { headers: { host } } : {});
  expect(response.status(), `${url} must be served from the built output`).toBe(200);
  return response.headers();
}

test.beforeAll(async () => {
  const supplied = configuredBaseURL();
  if (supplied !== undefined) {
    baseURL = supplied;
    return;
  }
  localServer = await startCspTestServer();
  baseURL = localServer.baseURL;
});

test.afterAll(async () => {
  await localServer?.close();
  localServer = undefined;
});

test('T-SEC-04 @headers serves every approved security header exactly on the built shell', async ({
  page,
}) => {
  const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);

  const policy = await readEndpointPolicy();
  const relayOrigin = process.env[policy.relayOriginEnvironmentVariable];
  const customDomainOrigin = process.env.CUSTOM_DOMAIN_ORIGIN;
  if (relayOrigin !== undefined) expect(isRelayOriginSafeForTest(relayOrigin)).toBe(true);
  if (customDomainOrigin !== undefined) {
    expect(isCustomDomainSafeForTest(customDomainOrigin)).toBe(true);
  }
  const expected: Record<string, string> = {
    'content-security-policy': expectedCspPolicy(relayOrigin),
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'permissions-policy': expectedPermissionsPolicy,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
  };
  const customHost = customDomainOrigin ? new URL(customDomainOrigin).hostname : undefined;
  const expectedHsts =
    customHost === new URL(baseURL).hostname ? 'max-age=63072000; includeSubDomains' : undefined;
  if (expectedHsts) expected['strict-transport-security'] = expectedHsts;

  const shellHeaders = response?.headers() ?? {};
  assertCspStructure(shellHeaders['content-security-policy'] ?? '', relayOrigin);
  for (const [name, value] of Object.entries(expected)) {
    expect(shellHeaders[name], `${name} on the shell response`).toBe(value);
  }

  expect(shellHeaders['strict-transport-security'], 'application HSTS must be host-scoped').toBe(
    expectedHsts,
  );
  const workerHeaders = await exactResponseHeaders(page, new URL('/sw.js', baseURL).href);
  for (const [name, value] of Object.entries(expected)) {
    expect(workerHeaders[name], `${name} on the service-worker response`).toBe(value);
  }
  expect(workerHeaders['strict-transport-security']).toBe(expectedHsts);
  expect(workerHeaders['cache-control'], 'the service worker must not be served as cacheable').toBe(
    'no-cache',
  );
  process.stdout.write(
    `[p0-headers] origin=${new URL(baseURL).origin}; exact security headers verified on / and /sw.js; relay=${relayOrigin ?? 'unset'}; application HSTS=${expectedHsts ? 'matched custom host' : 'omitted on this host'}; platform HSTS not simulated\n`,
  );
});

test('T-SEC-04 @headers scopes HSTS to the configured custom host, never a Pages host', async ({
  page,
}) => {
  const host = new URL(baseURL).hostname;
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    test.skip(true, 'Synthetic Host-header matching is limited to the local served build.');
  }

  const configuredCustomOrigin = process.env.CUSTOM_DOMAIN_ORIGIN;
  if (configuredCustomOrigin !== undefined) {
    expect(isCustomDomainSafeForTest(configuredCustomOrigin)).toBe(true);
  }
  const expectedCustomHost = configuredCustomOrigin
    ? new URL(configuredCustomOrigin).hostname
    : 'unconfigured.synthetic.invalid';
  const customHostHeaders = await exactResponseHeaders(page, baseURL, expectedCustomHost);
  const expectedCustomHsts = configuredCustomOrigin
    ? 'max-age=63072000; includeSubDomains'
    : undefined;
  expect(customHostHeaders['strict-transport-security']).toBe(expectedCustomHsts);
  const customWorkerHeaders = await exactResponseHeaders(
    page,
    new URL('/sw.js', baseURL).href,
    expectedCustomHost,
  );
  expect(customWorkerHeaders['strict-transport-security']).toBe(expectedCustomHsts);
  expect(customWorkerHeaders['cache-control']).toBe('no-cache');

  const pagesHostHeaders = await exactResponseHeaders(page, baseURL, 'synthetic-project.pages.dev');
  expect(pagesHostHeaders['strict-transport-security']).toBeUndefined();
  const pagesWorkerHeaders = await exactResponseHeaders(
    page,
    new URL('/sw.js', baseURL).href,
    'synthetic-project.pages.dev',
  );
  expect(pagesWorkerHeaders['strict-transport-security']).toBeUndefined();
  expect(pagesWorkerHeaders['cache-control']).toBe('no-cache');
  const unrelatedHostHeaders = await exactResponseHeaders(page, baseURL, 'other.synthetic.invalid');
  expect(unrelatedHostHeaders['strict-transport-security']).toBeUndefined();
  process.stdout.write(
    `[p0-headers] synthetic host controls: configured=${configuredCustomOrigin ? expectedCustomHost : 'unset'}; pages.dev=absent; unrelated=absent; platform HSTS not simulated\n`,
  );
});

test('T-SEC-04 @headers validates CSP-safe relay and custom-origin tokens', async () => {
  const validRelayOrigins = [
    'https://relay.synthetic.invalid',
    'https://relay.synthetic.invalid:8443',
    'https://localhost',
    'https://192.0.2.4',
    'https://[2001:db8::1]',
    'https://relay.synthetic.pages.dev',
  ];
  expect(validateRelayOrigin(undefined)).toBeUndefined();
  for (const origin of validRelayOrigins) {
    expect(isRelayOriginSafeForTest(origin), `independent positive relay vector: ${origin}`).toBe(
      true,
    );
    expect(validateRelayOrigin(origin)).toBe(origin);
  }

  expect(validateCustomDomainOrigin(undefined)).toBeUndefined();
  expect(isCustomDomainSafeForTest('https://cycle.synthetic.invalid')).toBe(true);
  expect(validateCustomDomainOrigin('https://cycle.synthetic.invalid')).toBe(
    'https://cycle.synthetic.invalid',
  );

  for (const injection of [
    'https://relay.synthetic.invalid;require-trusted-types-for',
    'https://relay.synthetic.invalid,default-src',
  ]) {
    expect(() => assertCspStructure(expectedCspPolicy(injection), injection)).toThrow();
  }

  const malformedOrigins = [
    '',
    ' https://relay.synthetic.invalid',
    'http://relay.synthetic.invalid',
    'https://relay.synthetic.invalid/path',
    'https://relay.synthetic.invalid?mode=wildcard',
    'https://*.synthetic.invalid',
    'https://user:secret@relay.synthetic.invalid',
    'https://relay.synthetic.invalid#fragment',
    'https://relay.synthetic.invalid;require-trusted-types-for',
    'https://relay.synthetic.invalid,default-src',
    "https://relay.synthetic.invalid'",
    'https://relay.synthetic.invalid"',
    'https://relay.synthetic.invalid{x}',
    'https://relay.synthetic.invalid}',
    'https://relay.synthetic.invalid$',
    'https://relay.synthetic.invalid.',
    'https://-relay.synthetic.invalid',
    'https://relay-.synthetic.invalid',
    'https://relay..synthetic.invalid',
    'https://relay.synthetic.invalid\nX-Injected: yes',
    'https://relay.synthetic.invalid%3bdefault-src',
    'https://relay.synthetic.invalid%0aX-Injected',
  ];
  for (const malformed of malformedOrigins) {
    expect(
      isRelayOriginSafeForTest(malformed),
      `independent negative relay vector: ${malformed}`,
    ).toBe(false);
    expect(
      isCustomDomainSafeForTest(malformed),
      `independent negative custom vector: ${malformed}`,
    ).toBe(false);
    expect(() => validateRelayOrigin(malformed), malformed).toThrow();
    expect(() => validateCustomDomainOrigin(malformed), malformed).toThrow();
  }

  for (const malformed of [
    'https://project.pages.dev',
    'https://sub.project.pages.dev',
    'https://cycle.synthetic.invalid:8443',
    'https://127.0.0.1',
    'https://[2001:db8::1]',
  ]) {
    expect(isCustomDomainSafeForTest(malformed), `independent custom-only rule: ${malformed}`).toBe(
      false,
    );
    expect(() => validateCustomDomainOrigin(malformed), malformed).toThrow();
  }
});

test('T-SEC-04 @headers malformed build origins fail before creating output', async () => {
  const scratchRoot = await mkdtemp(join(tmpdir(), 'flo-origin-validation-'));
  const previousRelay = process.env.RELAY_ORIGIN;
  const previousCustom = process.env.CUSTOM_DOMAIN_ORIGIN;
  try {
    const invalidBuilds = [
      {
        name: 'relay-semicolon',
        variable: 'RELAY_ORIGIN',
        value: 'https://relay.synthetic.invalid;require-trusted-types-for',
        isSafe: isRelayOriginSafeForTest,
      },
      {
        name: 'custom-comma',
        variable: 'CUSTOM_DOMAIN_ORIGIN',
        value: 'https://cycle.synthetic.invalid,default-src',
        isSafe: isCustomDomainSafeForTest,
      },
    ] as const;
    for (const invalid of invalidBuilds) {
      delete process.env.RELAY_ORIGIN;
      delete process.env.CUSTOM_DOMAIN_ORIGIN;
      process.env[invalid.variable] = invalid.value;
      const outputDirectory = join(scratchRoot, invalid.name);
      expect(invalid.isSafe(invalid.value)).toBe(false);
      await expect(buildSecurityHeaders(outputDirectory)).rejects.toThrow();
      await expect(access(outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  } finally {
    if (previousRelay === undefined) delete process.env.RELAY_ORIGIN;
    else process.env.RELAY_ORIGIN = previousRelay;
    if (previousCustom === undefined) delete process.env.CUSTOM_DOMAIN_ORIGIN;
    else process.env.CUSTOM_DOMAIN_ORIGIN = previousCustom;
    await rm(scratchRoot, { recursive: true, force: true });
  }
});
