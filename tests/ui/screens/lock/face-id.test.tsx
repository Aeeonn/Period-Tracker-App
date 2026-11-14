// @vitest-environment happy-dom
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bytes } from '../../../../src/contracts/brand.ts';
import { encodeBase64Url } from '../../../../src/crypto/primitives/encoding.ts';
import type { PasskeyAuthenticator } from '../../../../src/lock/passkey/index.ts';
import { LockScreen } from '../../../../src/ui/screens/lock/core/lock-screen.tsx';
import { FaceIdSettingsCard } from '../../../../src/ui/screens/lock/passkey/index.ts';
import { SYNTHETIC_PASSPHRASE, confirmSetup, createMemoryService } from '../../../lock/fixtures.ts';

const roots: HTMLElement[] = [];
const CREDENTIAL_ID = encodeBase64Url(new Uint8Array(16).fill(4));
const PRF_SALT = encodeBase64Url(new Uint8Array(32).fill(6));
const prf = (byte = 21): Bytes => new Uint8Array(32).fill(byte) as Bytes;

function fakeAuthenticator(overrides: Partial<PasskeyAuthenticator> = {}) {
  const issued: Bytes[] = [];
  const authenticator = {
    isAvailable: vi.fn(async () => true),
    enroll: vi.fn(async () => {
      const output = prf();
      issued.push(output);
      return {
        ok: true,
        value: { credentialId: CREDENTIAL_ID, prfSalt: PRF_SALT, prfOutput: output },
      } as const;
    }),
    evaluate: vi.fn<PasskeyAuthenticator['evaluate']>(async () => {
      const output = prf();
      issued.push(output);
      return { ok: true, value: output };
    }),
    forget: vi.fn<PasskeyAuthenticator['forget']>(async () => undefined),
    ...overrides,
  };
  return { authenticator, issued };
}

async function configuredService(withPasskey: boolean) {
  const service = createMemoryService();
  await confirmSetup(service);
  if (withPasskey) {
    const result = await service.enablePasskey(
      { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
      { credentialId: CREDENTIAL_ID, prfSalt: PRF_SALT, prfOutput: prf() },
    );
    if (!result.ok) throw new Error(`Synthetic passkey setup failed: ${result.error}`);
  }
  service.lock('manual');
  return service;
}

async function mount(node: ComponentChild): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(async () => {
    render(node, root);
  });
  return root;
}

async function waitFor(root: HTMLElement, predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error(`Screen did not reach the expected state: ${root.textContent}`);
}

function button(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
}

async function click(target: HTMLElement | undefined): Promise<void> {
  if (!target) throw new Error('Missing button.');
  await act(async () => {
    target.click();
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
});

describe('Lock screen Face ID unlock', () => {
  it('offers Face ID only when a passkey is enabled and the device supports it', async () => {
    const noPasskey = await configuredService(false);
    const { authenticator } = fakeAuthenticator();
    const first = await mount(<LockScreen service={noPasskey} passkeys={authenticator} />);
    await waitFor(first, () => first.querySelector('#lock-unlock-secret') !== null);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    expect(button(first, 'Unlock with Face ID')).toBeUndefined();

    const unavailable = fakeAuthenticator({ isAvailable: vi.fn(async () => false) });
    const second = await mount(
      <LockScreen service={await configuredService(true)} passkeys={unavailable.authenticator} />,
    );
    await waitFor(second, () => second.querySelector('#lock-unlock-secret') !== null);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    expect(button(second, 'Unlock with Face ID')).toBeUndefined();
  });

  it('unlocks with Face ID, zeroes the PRF output, and reports the unlock', async () => {
    const service = await configuredService(true);
    const { authenticator, issued } = fakeAuthenticator();
    const onUnlocked = vi.fn();
    const root = await mount(
      <LockScreen service={service} passkeys={authenticator} onUnlocked={onUnlocked} />,
    );
    await waitFor(root, () => button(root, 'Unlock with Face ID') !== undefined);
    await click(button(root, 'Unlock with Face ID'));
    await waitFor(root, () => onUnlocked.mock.calls.length === 1);
    expect(service.isUnlocked()).toBe(true);
    expect(authenticator.evaluate).toHaveBeenCalledWith({
      credentialId: CREDENTIAL_ID,
      prfSalt: PRF_SALT,
    });
    expect(issued.every((output) => output.every((byte) => byte === 0))).toBe(true);
  });

  it('keeps the passphrase form after Face ID is cancelled (T-SEC-07)', async () => {
    const service = await configuredService(true);
    const { authenticator } = fakeAuthenticator({
      evaluate: vi.fn(async () => ({ ok: false, error: 'cancelled' }) as const),
    });
    const onUnlocked = vi.fn();
    const root = await mount(
      <LockScreen service={service} passkeys={authenticator} onUnlocked={onUnlocked} />,
    );
    await waitFor(root, () => button(root, 'Unlock with Face ID') !== undefined);
    await click(button(root, 'Unlock with Face ID'));
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'Face ID was cancelled or timed out. You can unlock with your passphrase.',
    );
    expect(service.isUnlocked()).toBe(false);
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(root.querySelector('#lock-unlock-secret')).not.toBeNull();
  });
});

describe('Settings Face ID card', () => {
  async function unlockedService(withPasskey: boolean) {
    const service = await configuredService(withPasskey);
    const unlocked = await service.unlock({
      kind: 'passphrase',
      passphrase: SYNTHETIC_PASSPHRASE,
    });
    if (!unlocked.ok) throw new Error('Synthetic unlock failed.');
    return service;
  }

  async function submitPassphrase(root: HTMLElement, passphrase: string): Promise<void> {
    await click(button(root, 'Turn on Face ID'));
    const input = root.querySelector<HTMLInputElement>('#face-id-passphrase');
    if (!input) throw new Error('Missing passphrase input.');
    await act(async () => {
      input.value = passphrase;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = root.querySelector<HTMLFormElement>('.face-id-card__form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('explains when Face ID is unavailable', async () => {
    const { authenticator } = fakeAuthenticator({ isAvailable: vi.fn(async () => false) });
    const root = await mount(
      <FaceIdSettingsCard service={await unlockedService(false)} passkeys={authenticator} />,
    );
    await waitFor(root, () => root.textContent?.includes('not available here') === true);
    expect(button(root, 'Turn on Face ID')).toBeUndefined();
  });

  it('turns Face ID on after the passphrase and Face ID prompt, then off again', async () => {
    const service = await unlockedService(false);
    const { authenticator, issued } = fakeAuthenticator();
    const root = await mount(<FaceIdSettingsCard service={service} passkeys={authenticator} />);
    await waitFor(root, () => button(root, 'Turn on Face ID') !== undefined);
    expect(root.textContent).toContain("anyone who knows this iPhone's passcode could open Flo");

    await submitPassphrase(root, SYNTHETIC_PASSPHRASE);
    await waitFor(root, () => button(root, 'Turn off Face ID') !== undefined);
    expect(root.textContent).toContain('Face ID unlock is on for this device.');
    expect(await service.passkeyInfo()).toEqual({ credentialId: CREDENTIAL_ID, prfSalt: PRF_SALT });
    expect(issued.every((output) => output.every((byte) => byte === 0))).toBe(true);

    await click(button(root, 'Turn off Face ID'));
    await waitFor(root, () => button(root, 'Turn on Face ID') !== undefined);
    expect(await service.passkeyInfo()).toBeUndefined();
    expect(authenticator.forget).toHaveBeenCalledWith(CREDENTIAL_ID);
  });

  it('forgets the new passkey and changes nothing when the passphrase is wrong', async () => {
    const service = await unlockedService(false);
    const { authenticator } = fakeAuthenticator();
    const root = await mount(<FaceIdSettingsCard service={service} passkeys={authenticator} />);
    await waitFor(root, () => button(root, 'Turn on Face ID') !== undefined);
    await submitPassphrase(root, 'synthetic wrong words 11');
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'That passphrase did not match. Face ID was not turned on.',
    );
    expect(authenticator.forget).toHaveBeenCalledWith(CREDENTIAL_ID);
    expect(await service.passkeyInfo()).toBeUndefined();
  });

  it('reports a cancelled Face ID prompt without changing the lock', async () => {
    const service = await unlockedService(false);
    const { authenticator } = fakeAuthenticator({
      enroll: vi.fn(async () => ({ ok: false, error: 'cancelled' }) as const),
    });
    const root = await mount(<FaceIdSettingsCard service={service} passkeys={authenticator} />);
    await waitFor(root, () => button(root, 'Turn on Face ID') !== undefined);
    await submitPassphrase(root, SYNTHETIC_PASSPHRASE);
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'Face ID was cancelled or timed out. Nothing changed.',
    );
    expect(await service.passkeyInfo()).toBeUndefined();
  });

  it('forgets the new passkey when saving the Face ID wrap throws', async () => {
    const service = await unlockedService(false);
    vi.spyOn(service, 'enablePasskey').mockRejectedValue(new Error('synthetic storage failure'));
    const { authenticator } = fakeAuthenticator();
    const root = await mount(<FaceIdSettingsCard service={service} passkeys={authenticator} />);
    await waitFor(root, () => button(root, 'Turn on Face ID') !== undefined);
    await submitPassphrase(root, SYNTHETIC_PASSPHRASE);
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'Face ID could not be turned on. Nothing changed.',
    );
    expect(authenticator.forget).toHaveBeenCalledWith(CREDENTIAL_ID);
  });
});
