import { devices, expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

const UTC_ROLLOVER = Date.UTC(2032, 0, 1, 0, 15);
const CASES = [
  { zone: 'Pacific/Auckland', nowMs: UTC_ROLLOVER, expected: '2032-01-01', nextDay: '2032-01-02' },
  { zone: 'America/New_York', nowMs: UTC_ROLLOVER, expected: '2031-12-31', nextDay: '2032-01-01' },
  { zone: 'Europe/Berlin', nowMs: UTC_ROLLOVER, expected: '2032-01-01', nextDay: '2032-01-02' },
  { zone: 'UTC', nowMs: UTC_ROLLOVER, expected: '2032-01-01', nextDay: '2032-01-02' },
  {
    zone: 'America/Los_Angeles',
    nowMs: UTC_ROLLOVER,
    expected: '2031-12-31',
    nextDay: '2032-01-01',
  },
  {
    zone: 'America/New_York',
    nowMs: Date.UTC(2032, 2, 14, 7, 30),
    expected: '2032-03-14',
    nextDay: '2032-03-15',
  },
  {
    zone: 'Europe/Berlin',
    nowMs: Date.UTC(2032, 2, 28, 1, 30),
    expected: '2032-03-28',
    nextDay: '2032-03-29',
  },
] as const;

let server: ViteDevServer | undefined;
let origin = '';

test('P1 device-local clock and DST boundaries stay LocalDate values in all configured zones', async ({
  browser,
}, testInfo) => {
  const device =
    testInfo.project.name === 'webkit-iphone-se' ? devices['iPhone SE'] : devices['iPhone 13'];
  for (const testCase of CASES) {
    const context = await browser.newContext({
      ...device,
      timezoneId: testCase.zone,
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      const result = await page.evaluate(async (nowMs) => {
        const localdate = await import(`${location.origin}/src/lib/localdate/index.ts`);
        const date = localdate.todayLocal({ nowMs });
        return {
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          date,
          nextDay: localdate.addDays(date, 1),
          parsed: localdate.parse(date) === date,
        };
      }, testCase.nowMs);
      expect(result).toEqual({
        zone: testCase.zone,
        date: testCase.expected,
        nextDay: testCase.nextDay,
        parsed: true,
      });
    } finally {
      await context.close();
    }
  }
});

test.beforeAll(async () => {
  server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('P1 TZ fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
  server = undefined;
});
