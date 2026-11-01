// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { LocalDate } from '../../../../src/contracts/localdate.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { QuickLogSheet } from '../../../../src/ui/screens/quicklog/quick-log.tsx';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-quick-log-screen-device' as DeviceId;
const DATE = '2035-04-05' as LocalDate;
const roots: HTMLElement[] = [];

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return root;
}

async function click(root: HTMLElement, label: string): Promise<void> {
  const target = [...root.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  );
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    target.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Quick Log accessible behavior', () => {
  it('saves a symptom to the real repository and undo restores the prior tracker value', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    const onOpenChange = vi.fn();
    await act(async () => {
      render(
        <QuickLogSheet
          open
          onOpenChange={onOpenChange}
          localDate={DATE}
          logRepo={logRepo}
          pinnedTrackers={['symptoms_body', 'mood']}
        />,
        root,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(root.querySelector('dialog[open][aria-modal="true"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="Pinned quick-log trackers"]')).not.toBeNull();
    await click(root, 'Cramps');
    await expect(logRepo.getDay(DATE)).resolves.toMatchObject({
      symptoms_body: ['cramps'],
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Saved: Symptom: Cramps.',
    );

    await click(root, 'Undo');
    expect((await logRepo.getDay(DATE))?.symptoms_body).toBeUndefined();
  });

  it('rejects a future flow date and keeps log controls disabled while locked', async () => {
    const root = mount();
    render(
      <QuickLogSheet
        open
        onOpenChange={() => undefined}
        localDate={DATE}
        initialTracker="flow"
        logRepo={null}
        pinnedTrackers={[]}
      />,
      root,
    );

    expect(root.textContent).toContain('Unlock to save.');
    expect(root.textContent).toContain('No trackers are pinned.');
    const flowGroup = [...root.querySelectorAll('fieldset')].find(
      (fieldset) => fieldset.querySelector('legend')?.textContent === 'Flow level',
    );
    expect(flowGroup?.disabled).toBe(true);

    const dateInput = root.querySelector<HTMLInputElement>('#quick-log-flow-date');
    if (!dateInput) throw new Error('First-period date input is missing.');
    await act(async () => {
      dateInput.value = '2035-04-06';
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Choose today or a past date.');
  });

  it('shows a private retry message when a repository read fails instead of closing the sheet', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    vi.spyOn(logRepo, 'getDay').mockRejectedValue(new Error('synthetic repository failure'));
    const onOpenChange = vi.fn();
    render(
      <QuickLogSheet
        open
        onOpenChange={onOpenChange}
        localDate={DATE}
        logRepo={logRepo}
        pinnedTrackers={['desire']}
      />,
      root,
    );
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    await click(root, 'High');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'That log could not be saved. It remains private; please try again.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect((await logRepo.getDay(DATE).catch(() => undefined))?.desire).toBeUndefined();
  });
});
