// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { LogRepo } from '../../../../src/ui/screens/log/types.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { TodayScreen } from '../../../../src/ui/screens/today/today-screen.tsx';
import {
  TODAY_EMERGENCY_FIXTURE,
  TODAY_NO_DATA_FIXTURE,
  TODAY_PREVIEW_FIXTURE,
} from '../../../../src/ui/screens/today/preview-fixtures.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-today-screen-device' as DeviceId;
const roots: HTMLElement[] = [];

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return root;
}

async function click(root: HTMLElement, label: string): Promise<void> {
  const target = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
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

describe('Today screen accessible behavior', () => {
  it('explains ring segments, opens the first-period quick log, and keeps emergency guidance non-dismissible', async () => {
    const root = mount();
    render(<TodayScreen {...TODAY_NO_DATA_FIXTURE} logRepo={null} />, root);

    expect(root.querySelector('h1')?.textContent).toBe('Today');
    expect(root.querySelector('[role="img"][aria-label="Cycle ring"]')).not.toBeNull();
    expect(root.textContent).toContain('Log your first period');
    await click(root, 'Log first period');
    expect(root.querySelector('dialog[open][aria-modal="true"]')).not.toBeNull();
    expect(
      [...root.querySelectorAll('fieldset')].some(
        (fieldset) => fieldset.querySelector('legend')?.textContent === 'Flow level',
      ),
    ).toBe(true);

    render(null, root);
    render(<TodayScreen {...TODAY_EMERGENCY_FIXTURE} logRepo={null} />, root);
    const warning = root.querySelector('[role="alert"]');
    expect(warning?.textContent).toContain('A clinician guidance alert is active.');
    expect(root.textContent).toContain('Cannot dismiss while active');
    const periodControl = root.querySelector<HTMLButtonElement>(
      '[data-testid="today-ring-period-control"]',
    );
    if (!periodControl) throw new Error('Predicted period control is missing.');
    await act(async () => periodControl.click());
    expect(root.querySelector('.today-ring__explanation')?.textContent).toContain(
      'predicted period window',
    );
  });

  it('persists a period-start entry, allows undo, and removes only today’s flow tracker', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo: LogRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    render(<TodayScreen {...TODAY_PREVIEW_FIXTURE} logRepo={logRepo} />, root);

    await click(root, 'Period started');
    await expect(logRepo.getDay(TODAY_PREVIEW_FIXTURE.today)).resolves.toMatchObject({
      flow: 'medium',
    });
    expect(root.querySelector('.today-screen__cycle-day')?.textContent).toContain('Cycle day 1');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Saved: Period started.');

    await click(root, 'Undo');
    expect((await logRepo.getDay(TODAY_PREVIEW_FIXTURE.today))?.flow).toBeUndefined();
    expect(root.querySelector('.today-screen__cycle-day')?.textContent).toContain('Cycle day 12');

    await click(root, 'Period started');
    const remove = root.querySelector<HTMLButtonElement>(
      `button[aria-label="Remove today's period entry"]`,
    );
    if (!remove) throw new Error('Saved period entry removal control is missing.');
    await act(async () => {
      remove.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await expect(logRepo.getDay(TODAY_PREVIEW_FIXTURE.today)).resolves.toMatchObject({
      localDate: TODAY_PREVIEW_FIXTURE.today,
    });
    expect((await logRepo.getDay(TODAY_PREVIEW_FIXTURE.today))?.flow).toBeUndefined();
  });

  it('reports a real repository save failure without displaying a successful toast', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    vi.spyOn(logRepo, 'getDay').mockRejectedValue(new Error('synthetic store read failure'));
    render(<TodayScreen {...TODAY_PREVIEW_FIXTURE} logRepo={logRepo} />, root);

    await click(root, 'Period started');

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'That entry could not be saved. Please try again.',
    );
    expect(root.querySelector('.ui-toast')).toBeNull();
  });
});
