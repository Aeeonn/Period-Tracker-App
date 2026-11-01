import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { validateServiceWorkerScriptURL } from '../../src/sw/client';
import { startCspTestServer, type CspTestServer } from './csp-fixtures/server';
import {
  assertOnlyAllowedOrigins,
  attachNetworkRecorder,
  resolveAllowedOrigins,
  type EndpointPolicy,
} from './csp-fixtures/recorder';
import { configureThroughUi, fillConfirmation } from './helpers/lock';

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

async function finishOwnerOnboardingFromShell(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toBeVisible();
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
  const recovery = await configureThroughUi(page);
  await fillConfirmation(page, recovery.code, recovery.positions);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Who runs the app/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
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

test.describe('F1 production Trusted Types engine worker regression', () => {
  test.use({ ignoreHTTPSErrors: true });

  test('T-NET-01 @network renders Today and Calendar under generated CSP on both iPhone descriptors', async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    expect(['webkit-iphone-se', 'webkit-iphone-13']).toContain(testInfo.project.name);

    let dedicatedServer: CspTestServer | undefined;
    const cspServer = localServer ?? (dedicatedServer = await startCspTestServer());
    const recorder = await attachNetworkRecorder(context, page);
    const engineWorkerRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes('/engine.worker-')) engineWorkerRequests.push(url.href);
    });

    try {
      await page.clock.install({ time: new Date('2032-04-05T12:00:00.000Z') });
      const response = await page.goto(cspServer.baseURL, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      const policy = response?.headers()['content-security-policy'] ?? '';
      expect(policy).toContain("worker-src 'self'");
      expect(policy).toContain("require-trusted-types-for 'script'");

      await finishOwnerOnboardingFromShell(page);
      await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
      await expect(page.locator('.today-chance__uncertainty')).toContainText('uncertain');
      await expect(page.locator('.today-safety-line')).toContainText('"safe"');
      await expect.poll(() => engineWorkerRequests.length).toBeGreaterThan(0);

      const appOrigin = new URL(cspServer.baseURL).origin;
      const todayWorkerCount = engineWorkerRequests.length;
      await page.getByRole('link', { name: 'Calendar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
      await expect(page.getByRole('grid', { name: 'April 2032 calendar' })).toBeVisible();
      await expect.poll(() => engineWorkerRequests.length).toBeGreaterThan(todayWorkerCount);

      for (const workerURL of engineWorkerRequests) {
        const parsed = new URL(workerURL);
        expect(parsed.origin).toBe(appOrigin);
        expect(parsed.pathname).toMatch(/^\/assets\/engine\.worker-[\w-]+\.js$/);
      }

      const attempts = await recorder.allObservations();
      expect(
        attempts.some(
          (item) =>
            item.kind === 'worker-attempt' &&
            new URL(item.url).origin === appOrigin &&
            new URL(item.url).pathname.includes('/engine.worker-'),
        ),
      ).toBe(true);
      expect(await recorder.policyViolations()).toEqual([]);
      expect(recorder.browserErrors).toEqual([]);
      process.stdout.write(
        `[F1-csp] project=${testInfo.project.name}; origin=${appOrigin}; engineWorkerRequests=${engineWorkerRequests.length}; Today=uncertainty+no-safe-day; Calendar=rendered; CSP=clean; browserErrors=0\n`,
      );
    } finally {
      if (dedicatedServer) {
        try {
          await context.close();
        } finally {
          await dedicatedServer.close();
        }
      }
    }
  });
});
