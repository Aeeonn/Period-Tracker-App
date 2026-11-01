// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryService, SYNTHETIC_PASSPHRASE } from '../../../lock/fixtures.ts';
import { LockScreen } from '../../../../src/ui/screens/lock/core/lock-screen.tsx';

const roots: HTMLElement[] = [];

async function mount(service: ReturnType<typeof createMemoryService>, onUnlocked: () => void) {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(async () => {
    render(<LockScreen service={service} onUnlocked={onUnlocked} />, root);
  });
  return root;
}

async function waitFor(root: HTMLElement, predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error(`Lock screen did not reach the expected state: ${root.textContent}`);
}

async function enter(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function requiredInput(root: HTMLElement, selector: string): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Missing lock screen input: ${selector}`);
  return input;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Lock screen accessible setup and unlock lifecycle', () => {
  it('confirms the displayed recovery code, discards it on lock, and reports wrong then valid unlocks', async () => {
    const service = createMemoryService();
    const onUnlocked = vi.fn();
    const root = await mount(service, onUnlocked);

    await waitFor(root, () => root.querySelector('#lock-setup-passphrase') !== null);
    await enter(requiredInput(root, '#lock-setup-passphrase'), SYNTHETIC_PASSPHRASE);
    const setupForm = root.querySelector<HTMLFormElement>('.lock-screen__form');
    if (!setupForm) throw new Error('Lock setup form is missing.');
    await submit(setupForm);

    await waitFor(root, () => root.querySelector('[data-testid="recovery-code"]') !== null);
    const displayedCode = root
      .querySelector('[data-testid="recovery-code"]')
      ?.textContent?.replaceAll('-', '');
    if (!displayedCode) throw new Error('The one-time recovery code is missing.');
    const instruction = root.querySelector(
      '[data-testid="recovery-confirm-form"] #lock-confirm-instructions',
    )?.textContent;
    const positions = instruction?.match(/\d+/gu)?.map(Number);
    if (!positions || positions.length !== 4) {
      throw new Error('Recovery confirmation positions are missing.');
    }

    const confirmationInputs = [...root.querySelectorAll<HTMLInputElement>(
      '[data-testid="recovery-confirm-form"] input[aria-label^="Character at position"]',
    )];
    expect(confirmationInputs).toHaveLength(4);
    for (let index = 0; index < confirmationInputs.length; index += 1) {
      const position = positions[index];
      if (position === undefined) throw new Error('A confirmation position is missing.');
      const character = displayedCode[position - 1];
      if (!character) throw new Error('A recovery code character is missing.');
      await enter(confirmationInputs[index]!, index === 0 ? (character === 'A' ? 'B' : 'A') : character);
    }
    const confirmationForm = root.querySelector<HTMLFormElement>(
      '[data-testid="recovery-confirm-form"]',
    );
    if (!confirmationForm) throw new Error('Recovery confirmation form is missing.');
    await submit(confirmationForm);
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Those characters did not match.',
    );
    expect(await service.setupState()).toBe('pending_confirmation');

    for (let index = 0; index < confirmationInputs.length; index += 1) {
      const position = positions[index];
      if (position === undefined) throw new Error('A confirmation position is missing.');
      const character = displayedCode[position - 1];
      if (!character) throw new Error('A recovery code character is missing.');
      await enter(confirmationInputs[index]!, character);
    }
    await submit(confirmationForm);
    await waitFor(root, () => root.querySelector('[data-testid="lock-state"]')?.textContent === 'unlocked');
    expect(await service.setupState()).toBe('configured');
    expect(service.isUnlocked()).toBe(true);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Lock setup is complete.');

    await act(async () => service.lock('timeout'));
    await waitFor(root, () => root.querySelector('#lock-unlock-secret') !== null);
    expect(root.querySelector('[data-testid="recovery-code"]')).toBeNull();
    const unlockForm = root.querySelector<HTMLFormElement>('.lock-screen__form');
    if (!unlockForm) throw new Error('Unlock form is missing.');
    const unlockInput = requiredInput(root, '#lock-unlock-secret');

    await enter(unlockInput, 'synthetic incorrect passphrase');
    await submit(unlockForm);
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'That secret did not unlock this device.',
    );
    expect(unlockInput.value).toBe('');
    expect(service.isUnlocked()).toBe(false);

    await enter(unlockInput, SYNTHETIC_PASSPHRASE);
    await submit(unlockForm);
    await waitFor(root, () => root.querySelector('[data-testid="lock-state"]')?.textContent === 'unlocked');
    expect(service.isUnlocked()).toBe(true);
    expect(onUnlocked).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Unlocked');
  });
});
