import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { handle, memoryStore, type Env } from '../../relay/src/index.ts';

const env = { DB: undefined as never, ALLOWED_ORIGINS: 'http://localhost:4173' } satisfies Env;

/** Serve https://relay.test from the real relay code with an in-memory store.
 * Service workers are blocked in these contexts so Playwright can intercept the requests. */
async function useRelay(context: BrowserContext, store: ReturnType<typeof memoryStore>) {
  await context.route('https://relay.test/**', async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await handle(
      new Request(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        ...(body ? { body: new Uint8Array(body) } : {}),
      }),
      env,
      store,
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function setUpOwner(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up my tracker' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
}

test('her logs, sharing choices, pause and stop reach his phone', async ({ browser }) => {
  const store = memoryStore();
  const her = await browser.newContext({ serviceWorkers: 'block' });
  const him = await browser.newContext({ serviceWorkers: 'block' });
  await useRelay(her, store);
  await useRelay(him, store);
  const owner = await her.newPage();
  const partner = await him.newPage();

  await setUpOwner(owner);
  await owner.getByRole('button', { name: 'Log today' }).click();
  await owner.getByRole('switch', { name: 'Had sex' }).check();
  await owner.getByRole('button', { name: 'Great', exact: true }).click();
  await owner.getByRole('button', { name: 'Calm' }).click();
  await owner.getByRole('button', { name: /^Notes/ }).click();
  await owner.locator('textarea').fill('secret note');
  await owner.getByRole('button', { name: 'Done' }).click();

  await owner.getByRole('link', { name: 'Share' }).click();
  await owner.getByRole('button', { name: 'Start sharing' }).click();
  const code = (await owner.locator('code.code').textContent()) ?? '';
  expect(code).toMatch(/^flo1\./);
  await owner.getByRole('switch', { name: 'Sex', exact: true }).check();
  await expect(owner.getByText(/^Sent /)).toBeVisible({ timeout: 10_000 });

  await partner.goto('/');
  await partner.getByRole('button', { name: 'Connect to her' }).click();
  await partner.getByRole('textbox', { name: 'Pairing code' }).fill(code);
  await partner.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(partner.getByText(/Sex \(Great\)/)).toBeVisible();
  await expect(partner.getByText(/Calm/)).toHaveCount(0);
  await expect(partner.getByText('secret note')).toHaveCount(0);
  const stored = [...store.snapshots.values()].map((box) => box.ct).join();
  expect(stored).not.toContain('Great');

  await owner.getByRole('switch', { name: /Pause sharing/ }).check();
  await expect(async () => {
    await partner.getByRole('button', { name: 'Refresh' }).click();
    await expect(partner.getByRole('heading', { name: 'Sharing is paused' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
  await expect(partner.getByText(/Sex \(Great\)/)).toHaveCount(0);

  owner.once('dialog', (dialog) => void dialog.accept());
  await owner.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(owner.getByRole('button', { name: 'Start sharing' })).toBeVisible();
  expect(store.couples.size).toBe(0);
  await partner.getByRole('button', { name: 'Refresh' }).click();
  await expect(partner.getByRole('heading', { name: 'Sharing has ended' })).toBeVisible();

  await her.close();
  await him.close();
});
