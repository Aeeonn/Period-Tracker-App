import { expect, type Page } from '@playwright/test';

const DEFAULT_TEST_PASSPHRASE = 'synthetic harbor glimmer 74';
const APP_READY_TIMEOUT_MS = 15_000;

export async function configureThroughUi(
  page: Page,
  passphrase = DEFAULT_TEST_PASSPHRASE,
): Promise<{ code: string; positions: number[] }> {
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await expect(
    page.getByText(/Your passphrase never leaves this device and isn't stored/),
  ).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Create passphrase' }).click();
  const code = (await page.getByTestId('recovery-code').textContent())?.trim();
  if (!code) throw new Error('Recovery code was not rendered');
  const prompt = await page.getByText(/^Enter the characters at positions/).textContent();
  const positions = prompt?.match(/\d+/gu)?.map(Number) ?? [];
  if (positions.length !== 4) throw new Error('Recovery confirmation positions were not rendered');
  return { code, positions };
}

export async function fillConfirmationFields(
  page: Page,
  code: string,
  positions: readonly number[],
): Promise<void> {
  const canonical = code.replaceAll('-', '');
  for (const [index, position] of positions.entries()) {
    const input = page.getByLabel(`Character at position ${position}`, { exact: true });
    await input.fill(canonical[position - 1]!);
    if (index === 0) await expect(input).toBeFocused();
  }
}

export async function fillConfirmation(
  page: Page,
  code: string,
  positions: readonly number[],
): Promise<void> {
  await fillConfirmationFields(page, code, positions);
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
}

export async function setupOrUnlockApp(
  page: Page,
  passphrase = DEFAULT_TEST_PASSPHRASE,
): Promise<void> {
  const createHeading = page.getByRole('heading', { name: 'Create your lock' });
  const unlockHeading = page.getByRole('heading', { name: 'Unlock this device' });
  await expect(createHeading.or(unlockHeading)).toBeVisible();

  if (await createHeading.isVisible()) {
    const { code, positions } = await configureThroughUi(page, passphrase);
    await fillConfirmation(page, code, positions);
  } else {
    await expect(unlockHeading).toBeVisible();
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  }

  await expect(page.getByRole('navigation', { name: 'Cycle owner navigation' })).toBeVisible({
    timeout: APP_READY_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: APP_READY_TIMEOUT_MS,
  });
}
