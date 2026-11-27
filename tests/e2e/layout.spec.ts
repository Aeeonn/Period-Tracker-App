import { expect, test, type Page } from '@playwright/test';

// Layout at rest is the same with or without motion; reduced motion keeps the measurements stable.
test.use({ reducedMotion: 'reduce' });

/** Scrolled to the bottom: how far the page overflows sideways, and how far its end clears the tab bar. */
async function measure(page: Page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const nav = document.querySelector('nav.tabs');
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const body = document.querySelector('main > .screen__body') ?? document.querySelector('main');
    const end = body?.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      clearance: Math.floor(navTop - end),
    };
  });
}

async function expectFits(page: Page, screen: string) {
  const { overflow, clearance } = await measure(page);
  expect(overflow, `${screen} is wider than the screen`).toBeLessThanOrEqual(0);
  expect(clearance, `the end of ${screen} is under the tab bar`).toBeGreaterThanOrEqual(0);
}

test('every screen fits the width and ends above the tab bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /add Flo to your Home Screen/ })).toBeVisible();
  await expectFits(page, 'Welcome');
  await page.getByRole('button', { name: 'Set up my tracker' }).click();
  await expect(page.getByLabel('Usual cycle length (days)')).toBeVisible();
  await expectFits(page, 'Setup');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Log today' })).toBeVisible();
  await expectFits(page, 'Today (empty)');

  await page.getByRole('button', { name: 'Log today' }).click();
  await page.getByRole('switch', { name: 'Had sex' }).check();
  await page.getByRole('button', { name: 'Great', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  for (const section of [/^Body/, /^Habits/, /^Notes/]) {
    await page.getByRole('button', { name: section }).click();
  }
  await expect(page.getByRole('button', { name: 'More water' })).toBeVisible();
  await expectFits(page, 'Log');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Edit today' })).toBeVisible();
  await expectFits(page, 'Today');

  for (const tab of ['Calendar', 'Patterns', 'Share', 'Settings']) {
    await page.getByRole('link', { name: tab }).click();
    await expect(page.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page');
    await expectFits(page, tab);
  }
});
