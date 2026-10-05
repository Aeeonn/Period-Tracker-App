import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { validateServiceWorkerScriptURL } from '../../src/sw/client';
import { startCspTestServer, type CspTestServer } from './csp-fixtures/server';
import {
  assertOnlyAllowedOrigins,
  attachNetworkRecorder,
  resolveAllowedOrigins,
  type EndpointPolicy,
} from './csp-fixtures/recorder';

test.use({
  ignoreHTTPSErrors:
    process.env.BASE_URL === undefined || process.env.CSP_IGNORE_HTTPS_ERRORS === 'true',
});

const endpointPolicyPath = resolve(process.cwd(), 'tools/allowed-endpoints.json');
const forbiddenOrigin = 'https://csp-third-party.invalid';
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

async function endpointPolicy(): Promise<EndpointPolicy> {
  return JSON.parse(await readFile(endpointPolicyPath, 'utf8')) as EndpointPolicy;
}

async function selectBaseURL(): Promise<void> {
  const supplied = configuredBaseURL();
  if (supplied !== undefined) {
    baseURL = supplied;
    return;
  }
  localServer = await startCspTestServer();
  baseURL = localServer.baseURL;
}

test.beforeAll(selectBaseURL);
test.afterAll(async () => {
  await localServer?.close();
  localServer = undefined;
});

test('T-NET-01 @network allows only the first-party built-shell requests', async ({
  page,
  context,
}) => {
  const recorder = await attachNetworkRecorder(context, page);
  const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return (
      registration?.active?.state === 'activated' && navigator.serviceWorker.controller !== null
    );
  });
  await page.waitForTimeout(150);

  const allowedOrigins = resolveAllowedOrigins(await endpointPolicy(), new URL(baseURL).origin);
  const observations = await recorder.allObservations();
  assertOnlyAllowedOrigins(observations, allowedOrigins);
  expect(observations.some((item) => item.kind.startsWith('request:'))).toBe(true);
  expect(observations.some((item) => new URL(item.url).origin === new URL(baseURL).origin)).toBe(
    true,
  );
  const policyViolations = await recorder.policyViolations();
  expect(
    policyViolations,
    'the built shell must register its worker without a CSP violation',
  ).toEqual([]);
  expect(
    recorder.browserErrors,
    'the permitted built shell must not produce browser errors',
  ).toEqual([]);
  process.stdout.write(
    `[p0-network] origin=${new URL(baseURL).origin}; requests=${recorder.observations.length}; failed=${recorder.observations.filter((item) => item.kind.startsWith('requestfailed:')).length}; CSP=${policyViolations.length}; browserErrors=${recorder.browserErrors.length}; serviceWorker=activated+controlling; allow=${allowedOrigins.join(',')}\n`,
  );
});

test('T-NET-01 @network seeded third-party paths fail the recorder naming their origin', async ({
  page,
  context,
}, testInfo) => {
  const recorder = await attachNetworkRecorder(context, page);
  const fixtureURL = new URL(baseURL);
  fixtureURL.searchParams.set('csp-fixture', 'third-party');
  const response = await page.goto(fixtureURL.href, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);

  const fixtureExecuted = await page.evaluate(() => window.__floCspFixtureExecuted === true);
  if (!fixtureExecuted && process.env.BASE_URL !== undefined) {
    test.skip(true, 'The supplied served build does not include the synthetic CSP fixture build.');
  }
  expect(fixtureExecuted, 'the same-origin injected fixture must execute').toBe(true);
  await page.waitForFunction(() => window.__floCspFixtureAttempts?.length === 5);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__floCspFixtureAttempts)).toEqual([
    'fetch',
    'xhr',
    'image',
    'worker',
    'manifest',
  ]);

  const violations = await recorder.policyViolations();
  const observations = await recorder.allObservations();
  for (const path of ['/fetch', '/xhr', '/image.png', '/manifest.webmanifest']) {
    expect(
      observations.some((item) => {
        try {
          const requestedUrl = new URL(item.url);
          return requestedUrl.origin === forbiddenOrigin && requestedUrl.pathname === path;
        } catch {
          return false;
        }
      }),
      `the recorder must identify the attempted ${path} path from ${forbiddenOrigin}`,
    ).toBe(true);
  }
  expect(
    observations.some((item) => {
      try {
        return new URL(item.url).origin === forbiddenOrigin;
      } catch {
        return false;
      }
    }),
    'the recorder must observe a blocked request attempt from the forbidden origin',
  ).toBe(true);

  let failure = '';
  try {
    assertOnlyAllowedOrigins(
      observations,
      resolveAllowedOrigins(await endpointPolicy(), new URL(baseURL).origin),
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  expect(failure).toContain(forbiddenOrigin);
  expect(failure).toMatch(/Disallowed network origins/);

  const observedDirectives = new Set(
    violations.map((violation) => violation.kind.replace(/^csp:/, '')),
  );
  expect(
    observations.some(
      (item) => item.kind === 'worker-attempt' && new URL(item.url).origin === forbiddenOrigin,
    ),
    'the recorder must observe the rejected third-party worker constructor attempt',
  ).toBe(true);
  for (const directive of ['connect-src', 'img-src', 'manifest-src']) {
    expect(
      observedDirectives.has(directive),
      `the recorder must identify the ${directive} attempt from ${forbiddenOrigin}`,
    ).toBe(true);
  }
  const cspErrors = recorder.browserErrors.filter((entry) =>
    /content security policy|blocked/i.test(entry.message),
  );
  process.stdout.write(
    `[p0-network] seeded fixture executed=true; attempts=fetch,xhr,image,worker,manifest; failure=${failure}; CSP=${JSON.stringify(violations)}; browserErrors=${JSON.stringify(recorder.browserErrors)}; CSP-console=${cspErrors.length}; directives=${[...observedDirectives].join(',')}\n`,
  );
  testInfo.annotations.push({ type: 'negative-control', description: failure });
});

test('T-NET-01 @network rejects every service-worker script URL except /sw.js', () => {
  expect(validateServiceWorkerScriptURL('/sw.js')).toBe('/sw.js');
  for (const forbidden of [
    '/worker.js',
    '/sw.js?unapproved=1',
    'https://csp-third-party.invalid/sw.js',
    '//csp-third-party.invalid/sw.js',
  ]) {
    expect(() => validateServiceWorkerScriptURL(forbidden), forbidden).toThrow(
      /Only the same-origin \/sw\.js service-worker script is permitted/,
    );
  }
});
