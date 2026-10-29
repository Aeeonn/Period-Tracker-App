import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LockReason } from '../../src/contracts/lock.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import type { LockConfiguration } from '../../src/lock/core/persistence.ts';

interface LockFixtureApi {
  state(): Promise<string>;
  lock(reason?: LockReason): void;
  openStore(): Promise<void>;
  saveSyntheticRecord(record: LogicalRecord): Promise<void>;
  rawRecords(): Promise<string>;
  rawDump(): Promise<string>;
  lockConfiguration(): Promise<LockConfiguration | undefined>;
  attemptSetup(passphrase: string): Promise<boolean>;
  lockOnNextMetaCommitComplete(): void;
  hasOpenStore(): boolean;
}

declare global {
  interface Window {
    floLockDemo: LockFixtureApi;
  }
}

let vite: ViteDevServer | undefined;
let fixtureUrl = '';

async function openFixture(page: Page, timeoutMs = 60_000): Promise<string> {
  const databaseName = `synthetic-lock-${randomUUID()}`;
  await page.goto(`${fixtureUrl}?db=${encodeURIComponent(databaseName)}&timeout=${timeoutMs}`);
  await page.waitForFunction(() => window.floLockDemo !== undefined);
  return databaseName;
}

async function configureThroughUi(page: Page, passphrase = 'synthetic harbor glimmer 74') {
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

async function fillConfirmationFields(page: Page, code: string, positions: readonly number[]) {
  const canonical = code.replaceAll('-', '');
  for (const [index, position] of positions.entries()) {
    const input = page.getByLabel(`Character at position ${position}`, { exact: true });
    await input.fill(canonical[position - 1]!);
    if (index === 0) await expect(input).toBeFocused();
  }
}

async function fillConfirmation(page: Page, code: string, positions: readonly number[]) {
  await fillConfirmationFields(page, code, positions);
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
}

const synthetic = JSON.parse(
  readFileSync(new URL('../fixtures/schema/v0.json', import.meta.url), 'utf8'),
) as {
  readonly synthetic: true;
  readonly canary: string;
  readonly record: LogicalRecord;
};

const syntheticRecord: LogicalRecord = {
  ...synthetic.record,
  logicalId: `${synthetic.canary}-p0-lock` as LogicalRecord['logicalId'],
  ...(synthetic.record.deleted
    ? {}
    : { body: { ...synthetic.record.body, notes: synthetic.canary } }),
} as LogicalRecord;

const pageErrors = new WeakMap<Page, string[]>();

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
    throw new Error('Vite lock fixture server did not start');
  fixtureUrl = `http://127.0.0.1:${address.port}/tests/e2e/lock-fixtures/`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-SEC-02 @lock confirms setup, auto-locks hidden sessions, and cold-starts without decrypted DOM', async ({
  page,
}) => {
  const initialPassphrase = 'synthetic harbor glimmer 74';
  await openFixture(page, 150);
  const { code, positions } = await configureThroughUi(page, initialPassphrase);
  await expect(
    page.getByText(/If the app locks before you confirm, this code is discarded/),
  ).toBeVisible();
  await expect(
    page.getByText(/Leaving the app longer than your lock timeout \(60 seconds by default\)/),
  ).toBeVisible();
  const canonicalCode = code.replaceAll('-', '');
  const prompt = await page.getByText(/^Enter the characters at positions/).textContent();
  const actualPositions = prompt?.match(/\d+/gu)?.map(Number) ?? positions;
  const wrongPosition = actualPositions[0]!;
  const wrongCharacter = canonicalCode[wrongPosition - 1] === 'A' ? 'B' : 'A';
  await page
    .getByLabel(`Character at position ${wrongPosition}`, { exact: true })
    .fill(wrongCharacter);
  for (const position of actualPositions.slice(1)) {
    await page
      .getByLabel(`Character at position ${position}`, { exact: true })
      .fill(canonicalCode[position - 1]!);
  }
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
  await expect(page.getByRole('alert')).toContainText('Those characters did not match');
  expect(await page.evaluate(() => window.floLockDemo.lockConfiguration())).toBeUndefined();
  await fillConfirmation(page, code, actualPositions);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(await page.evaluate(() => window.floLockDemo.state())).toBe('configured:unlocked');
  const metadata = await page.evaluate(() => window.floLockDemo.lockConfiguration());
  expect(metadata?.passphrase.iterations).toBe(600_000);
  expect(metadata?.passphrase.wrapped.ct).toBeTruthy();
  expect(metadata?.recoveryCode.wrapped.ct).toBeTruthy();

  await page.evaluate((record) => window.floLockDemo.saveSyntheticRecord(record), syntheticRecord);
  expect(await page.evaluate(() => window.floLockDemo.hasOpenStore())).toBe(true);
  const rowsBeforeLock = JSON.parse(
    await page.evaluate(() => window.floLockDemo.rawRecords()),
  ) as Array<{ readonly ct?: string }>;
  expect(rowsBeforeLock).toHaveLength(1);
  expect(rowsBeforeLock[0]?.ct).toBeTruthy();

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.floLockDemo.state()))
    .toBe('configured:locked');
  expect(await page.evaluate(() => window.floLockDemo.hasOpenStore())).toBe(false);
  const rawDump = await page.evaluate(() => window.floLockDemo.rawDump());
  expect(rawDump).not.toContain(synthetic.canary);
  expect(rawDump).not.toContain(syntheticRecord.logicalId);
  expect(rawDump).not.toContain(code);
  expect(rawDump).not.toContain(initialPassphrase);
  const lockedDom = await page.locator('body').evaluate((body) => body.outerHTML);
  expect(lockedDom).not.toContain(synthetic.canary);
  expect(lockedDom).not.toContain(syntheticRecord.logicalId);
  expect(lockedDom).not.toContain(code);
  expect(lockedDom).not.toContain(initialPassphrase);
  const lockedInputs = await page
    .locator('input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(lockedInputs.every((value) => value === '')).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await expect(page.getByTestId('lock-state')).toHaveText('locked');
  const coldStartDom = await page.locator('body').evaluate((body) => body.outerHTML);
  expect(coldStartDom).not.toContain(synthetic.canary);
  expect(coldStartDom).not.toContain(syntheticRecord.logicalId);
  expect(coldStartDom).not.toContain(code);
  expect(coldStartDom).not.toContain(initialPassphrase);
});

test('@lock double confirmation on real IndexedDB stays configured and permits re-authenticated change', async ({
  page,
}) => {
  const passphrase = 'synthetic harbor glimmer 74';
  const changedPassphrase = 'synthetic cedar morning 82';
  await openFixture(page);
  const { code, positions } = await configureThroughUi(page, passphrase);
  await fillConfirmationFields(page, code, positions);
  await page.getByTestId('recovery-confirm-form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await expect
    .poll(() => page.evaluate(() => window.floLockDemo.state()))
    .toBe('configured:unlocked');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(await page.evaluate((value) => window.floLockDemo.attemptSetup(value), passphrase)).toBe(
    false,
  );

  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await page.getByLabel('Current passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('New passphrase', { exact: true }).fill(changedPassphrase);
  await page.getByRole('button', { name: 'Save new passphrase' }).click();
  await expect(page.getByRole('status')).toContainText('Your records were not re-encrypted');
  expect(await page.evaluate(() => window.floLockDemo.state())).toBe('configured:unlocked');
});

test('@lock retains configuration when lock lands at real IndexedDB transaction completion', async ({
  page,
}) => {
  const passphrase = 'synthetic harbor glimmer 74';
  const changedPassphrase = 'synthetic cedar morning 82';
  await openFixture(page);
  const { code, positions } = await configureThroughUi(page, passphrase);
  await fillConfirmationFields(page, code, positions);
  await page.evaluate(() => window.floLockDemo.lockOnNextMetaCommitComplete());
  await page.getByTestId('recovery-confirm-form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expect
    .poll(() => page.evaluate(() => window.floLockDemo.state()))
    .toBe('configured:locked');
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  expect(await page.evaluate((value) => window.floLockDemo.attemptSetup(value), passphrase)).toBe(
    false,
  );
  expect(await page.evaluate(() => window.floLockDemo.lockConfiguration())).toBeTruthy();

  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await page.getByLabel('Current passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('New passphrase', { exact: true }).fill(changedPassphrase);
  await page.getByRole('button', { name: 'Save new passphrase' }).click();
  await expect(page.getByRole('status')).toContainText('Your records were not re-encrypted');
});

test('@lock recovery changes only the passphrase wrap and clears one-use recovery authorization', async ({
  page,
}) => {
  await openFixture(page);
  const initialPassphrase = 'synthetic harbor glimmer 74';
  const changedPassphrase = 'synthetic cedar morning 82';
  const { code, positions } = await configureThroughUi(page, initialPassphrase);
  await fillConfirmation(page, code, positions);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.evaluate((record) => window.floLockDemo.saveSyntheticRecord(record), syntheticRecord);
  const rawBefore = await page.evaluate(() => window.floLockDemo.rawRecords());
  const before = await page.evaluate(() => window.floLockDemo.lockConfiguration());
  expect(rawBefore).toContain('"type"');

  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await page.getByLabel('Unlock method', { exact: true }).selectOption('recovery_code');
  await page.getByLabel('Recovery code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog', { name: 'Change passphrase' })).toBeVisible();
  const reuseRecoveryCode = page.getByLabel('Use the recovery code from this unlock once', {
    exact: true,
  });
  await expect(reuseRecoveryCode).toBeChecked();
  await expect(page.locator('body')).not.toContainText(code);
  await reuseRecoveryCode.click();
  await expect(reuseRecoveryCode).toHaveCount(0);
  await expect(page.getByLabel('Authorization method', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await expect(page.getByRole('dialog', { name: 'Change passphrase' })).toBeVisible();
  await expect(
    page.getByLabel('Use the recovery code from this unlock once', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Lock now' }).click();
  await page.getByLabel('Unlock method', { exact: true }).selectOption('recovery_code');
  await page.getByLabel('Recovery code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog', { name: 'Change passphrase' })).toBeVisible();
  await expect(
    page.getByLabel('Use the recovery code from this unlock once', { exact: true }),
  ).toBeChecked();
  await page.getByLabel('New passphrase', { exact: true }).fill(changedPassphrase);
  await page.getByRole('button', { name: 'Save new passphrase' }).click();
  await expect(page.getByRole('status')).toContainText('Your records were not re-encrypted');
  await expect(page.getByRole('dialog', { name: 'Change passphrase' })).toHaveCount(0);
  const after = await page.evaluate(() => window.floLockDemo.lockConfiguration());
  expect(after?.recoveryCode).toEqual(before?.recoveryCode);
  expect(after?.passphrase.salt).not.toBe(before?.passphrase.salt);
  expect(after?.passphrase.wrapped).not.toEqual(before?.passphrase.wrapped);
  expect(await page.evaluate(() => window.floLockDemo.rawRecords())).toBe(rawBefore);

  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await expect(
    page.getByLabel('Use the recovery code from this unlock once', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Lock now' }).click();
  await page.getByLabel('Unlock method', { exact: true }).selectOption('passphrase');
  await page.getByLabel('Passphrase', { exact: true }).fill(initialPassphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('That secret did not unlock this device');
  await expect(page.getByLabel('Passphrase', { exact: true })).toBeFocused();
  await page.getByLabel('Passphrase', { exact: true }).fill(changedPassphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Lock now' }).click();
  await page.getByLabel('Unlock method', { exact: true }).selectOption('recovery_code');
  await page.getByLabel('Recovery code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(
    page.getByLabel('Use the recovery code from this unlock once', { exact: true }),
  ).toBeChecked();
  await page.evaluate(() => window.floLockDemo.lock('manual'));
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await page.getByLabel('Unlock method', { exact: true }).selectOption('passphrase');
  await page.getByLabel('Passphrase', { exact: true }).fill(changedPassphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await expect(
    page.getByLabel('Use the recovery code from this unlock once', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Change passphrase' })).toBeVisible();
});

test('@lock labels lock forms, maintains contrast and targets, and respects reduced motion', async ({
  page,
}) => {
  await openFixture(page);
  const setupAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(setupAudit.violations).toEqual([]);

  const { code, positions } = await configureThroughUi(page);
  const canonicalCode = code.replaceAll('-', '');
  for (const [index, position] of positions.entries()) {
    const character = canonicalCode[position - 1]!;
    await page
      .getByLabel(`Character at position ${position}`, { exact: true })
      .fill(index === 0 ? (character === 'A' ? 'B' : 'A') : character);
  }
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
  await expect(page.getByRole('alert')).toContainText('Those characters did not match');
  const recoveryAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(recoveryAudit.violations).toEqual([]);
  expect(canonicalCode).toHaveLength(24);
  expect(positions).toHaveLength(4);

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const darkAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(darkAudit.violations).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page
    .locator('.lock-screen__content')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(motion).toBe('none');
  const targets = await page.locator('.lock-screen button:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }),
  );
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
});
