import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { configureThroughUi, fillConfirmation, setupOrUnlockApp } from './helpers/lock.ts';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function openFixture(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}/tests/e2e/today-fixtures/${query}`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function dismissToast(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
}

async function completeFreshOwnerOnboarding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
  const { code, positions } = await configureThroughUi(page);
  await fillConfirmation(page, code, positions);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Who runs the app’s servers?' })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('navigation', { name: 'Cycle owner navigation' })).toBeVisible();
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
    throw new Error('Today fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

type QuickLogFixtureDay = {
  readonly flow?: string | undefined;
  readonly symptoms_body?: readonly string[] | undefined;
  readonly mood?: readonly string[] | undefined;
  readonly desire?: string | undefined;
};

async function readQuickLogDay(page: Page): Promise<QuickLogFixtureDay | undefined> {
  return page.evaluate(async () => {
    const fixture = (
      window as Window & {
        __quickLogTest?: { readDay: () => Promise<QuickLogFixtureDay | undefined> };
      }
    ).__quickLogTest;
    return fixture?.readDay();
  });
}

test('T-UX-01 @today @quicklog period start takes one tap and quick logs stay within three taps', async ({
  page,
}) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Period started', exact: true }).click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Period started.');
  await expect(page.getByRole('heading', { name: 'Still bleeding today?' })).toBeVisible();
  await expect(page.getByText('Cycle day 1')).toBeVisible();
  await expect(page.locator('.today-ring__center')).toContainText('period day');
  await expect(page.locator('.today-ring__center')).toContainText('1');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Cycle day 12')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Still bleeding today?' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Pinned quick-log trackers' })
    .getByRole('button', { name: 'Flow', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Flow level' })
    .getByRole('button', { name: 'Medium', exact: true })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Flow: Medium.');
  await dismissToast(page);

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await page
    .getByRole('group', { name: 'Symptoms' })
    .getByRole('button', { name: 'Cramps', exact: true })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Symptom: Cramps.');
  expect(await readQuickLogDay(page)).toMatchObject({
    flow: 'medium',
    symptoms_body: ['cramps'],
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await readQuickLogDay(page)).toMatchObject({ flow: 'medium' });

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await page
    .getByRole('group', { name: 'Pinned quick-log trackers' })
    .getByRole('button', { name: 'Mood', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Mood' })
    .getByRole('button', { name: 'Low', exact: true })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Mood: Low.');
});

test('@quicklog missing repository shows Unlock to save and disables choices', async ({ page }) => {
  await openFixture(page, '?fixture=locked');
  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick log' });
  await expect(dialog.getByText(/Unlock to save/u)).toBeVisible();
  await expect(
    dialog.getByRole('group', { name: 'Symptoms' }).getByRole('button', { name: 'Cramps' }),
  ).toBeDisabled();
});

test('T-A11Y-01 @quicklog chips are named and the private sheet passes an accessibility audit', async ({
  page,
}) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick log' });
  const pinned = dialog.getByRole('group', { name: 'Pinned quick-log trackers' });
  await expect(pinned.getByRole('button', { name: 'Desire', exact: true })).toBeVisible();
  await expect(pinned.getByRole('button', { name: 'Sex and intimacy', exact: true })).toBeVisible();
  await pinned.getByRole('button', { name: 'Desire', exact: true }).click();
  await expect(
    dialog
      .getByRole('group', { name: 'Desire' })
      .getByRole('button', { name: 'High', exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText('Just for you, to notice your own patterns.');
  await pinned.getByRole('button', { name: 'Sex and intimacy', exact: true }).click();
  await expect(
    dialog
      .getByRole('group', { name: 'Sex and intimacy' })
      .getByRole('button', { name: 'Vaginal', exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText('Logging never implies consent or enables sharing.');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('T-UX-02 @today every prediction surface has a window and a Why sheet', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByText('Next period: around Nov 8')).toBeVisible();
  await expect(page.getByText('Expected window: Nov 6 – Nov 10')).toBeVisible();

  const whyButtons = page.getByRole('button', { name: 'Why?', exact: true });
  await expect(whyButtons).toHaveCount(2);
  await whyButtons.nth(0).click();
  const predictionWhy = page.getByRole('dialog', { name: 'Why?' });
  await expect(predictionWhy).toContainText('planning range');
  await predictionWhy.getByRole('button', { name: 'Close' }).click();

  await whyButtons.nth(1).click();
  const chanceWhy = page.getByRole('dialog', { name: 'Why?' });
  await expect(chanceWhy).toContainText('This category is an uncertain estimate.');
});

test('T-UX-02 @today suppressed output still explains the paused prediction', async ({ page }) => {
  await openFixture(page, '?suppression=no_data');
  await expect(page.getByText('Log your period to start predictions.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Log first period', exact: true }).click();
  const logDialog = page.getByRole('dialog', { name: 'Quick log' });
  await expect(logDialog).toBeVisible();
  await logDialog.getByRole('button', { name: 'Close' }).click();
  const whyButtons = page.getByRole('button', { name: 'Why?', exact: true });
  await expect(whyButtons).toHaveCount(2);
  await whyButtons.first().click();
  await expect(page.getByRole('dialog', { name: 'Why?' })).toContainText(
    'Log your period to start predictions.',
  );
});

test('T-REM-01 @today evaluates configured in-app reminders into the accessible banner', async ({
  page,
}) => {
  await openFixture(page, '?fixture=reminder');
  const banner = page.getByRole('status', { name: 'In-app reminders' });
  await expect(banner).toContainText('Time for your check-in.');
});

test('T-UX-04 @today keeps uncertainty and no-safe-days copy for every A5 suppression category', async ({
  page,
}) => {
  const cases = [
    ['', 'Medium'],
    ['pregnant', 'Not shown in pregnancy mode'],
    ['postpartum_before_first_period', 'Possible before a first period'],
    ['hormonal', 'Depends on method'],
    ['late', 'Unknown'],
    ['cycle_length', 'Not estimated'],
    ['no_data', 'Not enough data yet'],
  ] as const;

  for (const [reason, chanceLabel] of cases) {
    await openFixture(page, `?suppression=${reason}`);
    const body = await page.locator('body').innerText();
    expect(body).toContain(chanceLabel);
    expect(body).toContain('No day is "safe" without contraception.');
    expect(body).toContain('Pregnancy is possible any day.');
    expect(body).not.toMatch(/\b(?:zero chance|no chance)\b/iu);
    expect(body).not.toMatch(/\b(?:safe days? for sex|risk-free)\b/iu);
  }
});

test('T-UX-04 @today an EMERGENCY warning fixture cannot be dismissed while active', async ({
  page,
}) => {
  await openFixture(page, '?fixture=emergency');
  const warning = page.getByTestId('today-warning-W-01');
  const dismiss = page.getByTestId('today-warning-dismiss-W-01');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Emergency');
  await expect(dismiss).toBeDisabled();
  await dismiss.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(warning).toBeVisible();
});

test('T-UX-02 @today cycle ring, week strip, and stat tiles describe synthetic cycle data', async ({
  page,
}) => {
  await openFixture(page);
  const ring = page.getByRole('img', { name: 'Cycle ring', exact: true });
  await expect(ring).toHaveAttribute('aria-describedby', 'today-ring-description');
  await expect(page.getByText('17', { exact: true })).toBeVisible();
  await expect(page.getByText('days until period', { exact: true })).toBeVisible();
  await expect(page.getByTestId('today-ring-period-segment')).toBeVisible();
  await page.getByTestId('today-ring-period-segment').evaluate((segment) => {
    segment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('.today-ring__explanation')).toContainText(
    'This is the predicted period window. Dates can vary.',
  );
  const periodControl = page.getByTestId('today-ring-period-control');
  await periodControl.focus();
  await expect(periodControl).toBeFocused();
  await expect(page.locator('.today-ring__explanation')).toContainText(
    'This is the predicted period window. Dates can vary.',
  );
  await expect(page.getByTestId('today-ring-fertility-segment')).toBeVisible();
  await page.getByTestId('today-ring-fertility-control').click();
  await expect(page.locator('.today-ring__explanation')).toContainText(
    'Ovulation can happen outside these dates.',
  );

  const week = page.getByRole('list', { name: 'Week around today' });
  await expect(week).toBeVisible();
  await expect(week.getByRole('listitem')).toHaveCount(7);
  await expect(week.getByRole('listitem', { name: 'Monday, Oct 19' })).toBeVisible();
  await expect(week.getByRole('listitem', { name: 'Sunday, Oct 25' })).toBeVisible();
  await expect(week.getByRole('listitem', { name: 'Thursday, Oct 22, today' })).toHaveAttribute(
    'aria-current',
    'date',
  );
  await expect(page.getByRole('heading', { name: 'Next period' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fertile chance today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cycle day' })).toBeVisible();
  await expect(page.locator('.today-chance').getByText('Medium', { exact: true })).toBeVisible();
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/\b\d+(?:\.\d+)?%/u);
  expect(visibleText).not.toMatch(/\b(?:zero chance|no chance)\b/iu);
});

test('T-UX-02 @today suppressed estimates keep a cycle day and omit forecast segments', async ({
  page,
}) => {
  await openFixture(page, '?suppression=late');
  await expect(page.getByRole('img', { name: 'Cycle ring', exact: true })).toBeVisible();
  await expect(page.getByTestId('today-ring-period-segment')).toHaveCount(0);
  await expect(page.getByTestId('today-ring-fertility-segment')).toHaveCount(0);
  await expect(page.getByTestId('today-ring-today-segment')).toBeVisible();
  await expect(page.getByText('Day 12 of cycle')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cycle day' })).toBeVisible();
});

test('T-UX-02 @today no-data fixture omits cycle markers without inventing dates', async ({
  page,
}) => {
  await openFixture(page, '?suppression=no_data');
  await expect(page.getByRole('img', { name: 'Cycle ring', exact: true })).toBeVisible();
  await expect(page.getByTestId('today-ring-period-segment')).toHaveCount(0);
  await expect(page.getByTestId('today-ring-fertility-segment')).toHaveCount(0);
  await expect(page.getByTestId('today-ring-today-segment')).toHaveCount(0);
  await expect(page.locator('.today-ring__center')).toContainText('cycle day unavailable');
  await expect(page.getByText('Cycle dates are not available yet.')).toBeVisible();
});

test('T-UX-02 @today visual contrast meets WCAG AA in light and dark themes', async ({ page }) => {
  await openFixture(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
  }
});

test('Today @today keeps selectable synthetic data in the preview app shell', async ({ page }) => {
  await page.goto(`${origin}/?today=synthetic`);
  await setupOrUnlockApp(page);
  await expect(page.getByRole('navigation', { name: 'Cycle owner navigation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.shell-preview-banner')).toContainText('synthetic data only');
  await expect(page.getByText('Next period: around Nov 8')).toBeVisible();
  await expect(
    page.getByText('A reviewed education card will appear here when available.'),
  ).toBeVisible();
});

test('Today @today shows a friendly live empty state when no repository data is logged', async ({
  page,
}) => {
  await page.goto(`${origin}/`);
  await completeFreshOwnerOnboarding(page);
  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
  await expect(
    page.getByText('Log your first period to start building your cycle view.'),
  ).toBeVisible();
  await expect(page.getByText('Next period: around Nov 8')).toHaveCount(0);
});

test('Today @today buttons provide pressed feedback on the WebKit iPhone preview', async ({
  page,
}) => {
  await page.goto(`${origin}/`);
  await completeFreshOwnerOnboarding(page);
  const button = page.getByRole('button', { name: 'Log today', exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (box === null) throw new Error('Today button has no layout box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const touchStyle = await button.evaluate((element) => ({
    touchAction: getComputedStyle(element).touchAction,
    hoverShadow: getComputedStyle(element).boxShadow,
  }));
  expect(touchStyle.touchAction).toBe('manipulation');
  expect(touchStyle.hoverShadow).toBe('none');
  await page.mouse.down();
  const pressed = await button.evaluate((element) => ({
    active: element.matches(':active'),
    boxShadow: getComputedStyle(element).boxShadow,
  }));
  await page.mouse.up();
  expect(pressed.active).toBe(true);
  expect(pressed.boxShadow).not.toBe('none');
});
