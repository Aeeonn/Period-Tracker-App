import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const syntheticPassphrase = 'synthetic harbor glimmer 74';
let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

interface PasskeyStubState {
  mode: 'ok' | 'cancel';
  created: number;
  gets: number;
  lastRpId: string;
  lastUserVerification: string;
  forgotten: string[];
}

declare global {
  interface Window {
    floPasskeyStub: PasskeyStubState;
  }
}

/**
 * WebKit in Playwright has no virtual authenticator, so this replaces WebAuthn with a
 * deterministic synthetic PRF: SHA-256(synthetic secret || salt). Real Face ID is phone-only proof.
 */
function installPasskeyStub(): void {
  const state: PasskeyStubState = {
    mode: 'ok',
    created: 0,
    gets: 0,
    lastRpId: '',
    lastUserVerification: '',
    forgotten: [],
  };
  window.floPasskeyStub = state;
  const secret = new TextEncoder().encode('synthetic-passkey-secret');
  const rawId = new Uint8Array(16).fill(9);
  const asBytes = (value: BufferSource): Uint8Array =>
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const prf = async (salt: BufferSource): Promise<ArrayBuffer> => {
    const input = new Uint8Array(secret.length + salt.byteLength);
    input.set(secret);
    input.set(asBytes(salt), secret.length);
    return crypto.subtle.digest('SHA-256', input);
  };
  const credential = (first: ArrayBuffer | undefined) => ({
    type: 'public-key',
    rawId: rawId.slice().buffer,
    getClientExtensionResults: () => ({
      prf: first ? { enabled: true, results: { first } } : { enabled: true },
    }),
  });
  const cancelled = () => new DOMException('Synthetic Face ID cancelled', 'NotAllowedError');
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
      signalUnknownCredential: async (options: { credentialId: string }) => {
        state.forgotten.push(options.credentialId);
      },
    },
  });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      async create(options: CredentialCreationOptions) {
        if (state.mode === 'cancel') throw cancelled();
        state.created += 1;
        const publicKey = options.publicKey!;
        state.lastRpId = publicKey.rp.id ?? '';
        state.lastUserVerification = publicKey.authenticatorSelection?.userVerification ?? '';
        // Return no PRF result on create so the follow-up assertion path is exercised.
        return credential(undefined);
      },
      async get(options: CredentialRequestOptions) {
        if (state.mode === 'cancel') throw cancelled();
        state.gets += 1;
        const publicKey = options.publicKey!;
        state.lastRpId = publicKey.rpId ?? '';
        state.lastUserVerification = publicKey.userVerification ?? '';
        const salt = (publicKey.extensions as { prf: { eval: { first: BufferSource } } }).prf.eval
          .first;
        return credential(await prf(salt));
      },
    },
  });
}

async function configureApp(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Create passphrase' }).click();
  const code = (await page.getByTestId('recovery-code').textContent())?.trim();
  if (!code) throw new Error('Synthetic recovery code was not rendered');
  const instructions = await page.locator('#lock-confirm-instructions').textContent();
  const positions = instructions?.match(/\d+/gu)?.map(Number) ?? [];
  if (positions.length !== 4) throw new Error('Recovery confirmation positions were not rendered');
  const canonical = code.replaceAll('-', '');
  for (const position of positions) {
    await page
      .getByLabel(`Character at position ${position}`, { exact: true })
      .fill(canonical[position - 1]!);
  }
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
  await expect(page.locator('.shell-root')).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Face ID unlock' })).toBeVisible();
}

async function setStubMode(page: Page, mode: PasskeyStubState['mode']): Promise<void> {
  await page.evaluate((value) => {
    window.floPasskeyStub.mode = value;
  }, mode);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
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
  if (!address || typeof address === 'string') throw new Error('Passkey test server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('Face ID @passkey enrols, unlocks, falls back to the passphrase, and turns off', async ({
  page,
}) => {
  await page.addInitScript(installPasskeyStub);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${origin}/?today=synthetic`);
  await configureApp(page);
  await openSettings(page);

  const card = page.locator('.face-id-card');
  await expect(card).toContainText("anyone who knows this iPhone's passcode could open Flo");
  await card.getByRole('button', { name: 'Turn on Face ID' }).click();
  await card.getByLabel('Your passphrase').fill('synthetic wrong words 11');
  await card.getByRole('button', { name: 'Continue with Face ID' }).click();
  await expect(card.getByRole('alert')).toHaveText(
    'That passphrase did not match. Face ID was not turned on.',
  );
  expect(await page.evaluate(() => window.floPasskeyStub.forgotten.length)).toBe(1);

  await card.getByLabel('Your passphrase').fill(syntheticPassphrase);
  await card.getByRole('button', { name: 'Continue with Face ID' }).click();
  await expect(card.getByRole('status')).toHaveText('Face ID unlock is on for this device.');
  await expect(card.getByRole('button', { name: 'Turn off Face ID' })).toBeVisible();
  const stub = await page.evaluate(() => window.floPasskeyStub);
  expect(stub.lastRpId).toBe('127.0.0.1');
  expect(stub.lastUserVerification).toBe('required');

  const axe = await new AxeBuilder({ page })
    .include('.face-id-card')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await page.reload();
  const faceIdButton = page.getByRole('button', { name: 'Unlock with Face ID' });
  await expect(faceIdButton).toBeVisible();
  await setStubMode(page, 'cancel');
  await faceIdButton.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Face ID was cancelled. You can unlock with your passphrase.',
  );
  await expect(page.locator('#lock-unlock-secret')).toBeVisible();
  await expect(page.locator('.shell-root')).toHaveCount(0);

  await setStubMode(page, 'ok');
  await faceIdButton.click();
  await expect(page.locator('.shell-root')).toBeVisible();

  await page.reload();
  await page.locator('#lock-unlock-secret').fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.shell-root')).toBeVisible();

  await openSettings(page);
  await page.locator('.face-id-card').getByRole('button', { name: 'Turn off Face ID' }).click();
  await expect(page.locator('.face-id-card').getByRole('status')).toHaveText(
    'Face ID unlock is off. Use your passphrase to unlock.',
  );
  await page.reload();
  await expect(page.locator('#lock-unlock-secret')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock with Face ID' })).toHaveCount(0);
});

test('Lock after @passkey honours the saved timeout while the app is hidden', async ({ page }) => {
  await page.addInitScript(installPasskeyStub);
  await page.goto(`${origin}/?today=synthetic`);
  await configureApp(page);

  await setHidden(page, true);
  await setHidden(page, false);
  await expect(page.locator('.shell-root')).toBeVisible();

  await openSettings(page);
  await page.locator('#settings-lock-timeout').selectOption('0');
  await expect(page.getByText('Settings saved on this device.')).toBeVisible();
  await setHidden(page, true);
  await setHidden(page, false);
  await expect(page.locator('#lock-unlock-secret')).toBeVisible();
  await expect(page.locator('.shell-root')).toHaveCount(0);

  await page.locator('#lock-unlock-secret').fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.shell-root')).toBeVisible();
  await setHidden(page, true);
  await setHidden(page, false);
  await expect(page.locator('#lock-unlock-secret')).toBeVisible();
});
