import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function openCalendar(page: Page): Promise<void> {
  await page.goto(`${origin}/tests/e2e/log-fixtures/?fixture=calendar&today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'October 2026 calendar' })).toBeVisible();
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test.beforeAll(async () => {
  vite = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Calendar fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-UX-01 @calendar follows the saved Sunday week start', async ({ page }) => {
  await page.goto(`${origin}/tests/e2e/log-fixtures/?fixture=calendar-live&weekstart=sunday`);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader').first()).toHaveAttribute('aria-label', 'Sun');
});

test('T-UX-01 @calendar keeps its month layout usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openCalendar(page);
  await expect(page.getByRole('heading', { name: 'October 2026', exact: true })).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    screen: document.querySelector<HTMLElement>('.calendar-screen')?.scrollWidth ?? 0,
    screenClient: document.querySelector<HTMLElement>('.calendar-screen')?.clientWidth ?? 0,
    monthTitle: (() => {
      const title = document.querySelector<HTMLElement>('#calendar-period');
      return title === null ? undefined : { client: title.clientWidth, scroll: title.scrollWidth };
    })(),
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.screen).toBeLessThanOrEqual(layout.screenClient);
  expect(layout.monthTitle).toBeDefined();
  expect(layout.monthTitle?.scroll).toBeLessThanOrEqual(layout.monthTitle?.client ?? 0);

  const dayBox = await page.locator('.calendar-day').first().boundingBox();
  expect(dayBox?.height).toBeGreaterThanOrEqual(44);
});

test('T-UX-02 @calendar supports markers, year/month views, day details, and cycle exclusion preview', async ({
  page,
}) => {
  await openCalendar(page);

  const logged = page.getByRole('button', { name: /^October 11, 2026, logged period$/ });
  const assumed = page.getByRole('button', { name: /^October 13, 2026, assumed day$/ });
  const spotting = page.getByRole('button', { name: /^October 14, 2026, logged spotting$/ });
  const log = page.getByRole('button', { name: /October 22, 2026.*log present/ });
  await expect(logged).toBeVisible();
  await expect(assumed).toBeVisible();
  await expect(spotting).toBeVisible();
  await expect(log).toBeVisible();
  await assumed.focus();
  expect(await assumed.getAttribute('aria-label')).toContain('assumed day');
  await expect(page.locator('.calendar-day--assumed')).toHaveCSS('border-style', 'dashed');
  await expect(page.locator('.calendar-day--predicted').first()).toHaveCount(0);

  await page.getByRole('button', { name: 'Open calendar legend' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar legend' })).toBeVisible();
  await expect(page.getByText('predicted period window', { exact: true })).toBeVisible();
  await expect(page.getByText('Higher fertile day', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close calendar legend' }).click();

  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.getByRole('grid', { name: '2026 months' })).toBeVisible();
  await page.getByRole('button', { name: /View October 2026/ }).click();
  await expect(page.getByRole('grid', { name: 'October 2026 calendar' })).toBeVisible();

  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('grid', { name: 'September 2026 calendar' })).toBeVisible();
  await page.getByRole('button', { name: /^September 15, 2026/ }).click();
  await expect(page.getByRole('heading', { name: 'September 15, 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Period started here' }).click();
  await expect(page.getByRole('status')).toContainText('This change is not saved');
  await page.getByRole('button', { name: 'Exclude this cycle' }).click();
  await expect(page.getByRole('status')).toContainText('Cycle exclusion selected in this preview');

  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('grid', { name: 'October 2026 calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('grid', { name: 'November 2026 calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: /predicted period window/ }).first()).toBeVisible();
});

test('T-A11Y-01 @calendar meets automated WCAG AA checks in light and dark themes', async ({
  page,
}) => {
  await openCalendar(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const transitionDuration = await page
      .locator('.calendar-day')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transitionDuration).toBe('0s');
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, colorScheme);
    await page.evaluate(async () => {
      await Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    if (audit.violations.length > 0) {
      console.log(
        'Calendar axe contrast failures:',
        JSON.stringify(
          audit.violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map(({ html, target, any }) => ({
              html,
              target,
              checks: any.map(({ data, message }) => ({ data, message })),
            })),
          })),
          null,
          2,
        ),
      );
    }
    expect(audit.violations).toEqual([]);
  }
});
