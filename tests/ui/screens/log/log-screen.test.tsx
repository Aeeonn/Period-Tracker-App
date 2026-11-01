// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { LocalDate } from '../../../../src/contracts/localdate.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { LogScreen } from '../../../../src/ui/screens/log/log-screen.tsx';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-log-screen-device' as DeviceId;
const DATE = '2035-04-05' as LocalDate;
const roots: HTMLElement[] = [];

function createLogRepository() {
  const store = new MemoryRecordStore();
  return {
    store,
    logRepo: createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    }),
  };
}

async function mount(
  logRepo: ReturnType<typeof createLogRepo>,
  onPinnedTrackersChange = vi.fn(),
): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(async () => {
    render(
      <LogScreen
        logRepo={logRepo}
        localDate={DATE}
        pinnedTrackers={['flow', 'notes', 'sex', 'medication', 'bbt']}
        onPinnedTrackersChange={onPinnedTrackersChange}
      />,
      root,
    );
  });
  await act(async () => {
    await Promise.resolve();
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
  throw new Error(`Log screen did not reach the expected state: ${root.textContent}`);
}

function card(root: HTMLElement, heading: string): HTMLElement {
  const result = [...root.querySelectorAll<HTMLElement>('.log-screen__form-card')].find(
    (candidate) => candidate.querySelector('.log-editor h2')?.textContent === heading,
  );
  if (!result) throw new Error(`Missing tracker editor: ${heading}`);
  return result;
}

async function clickButton(root: HTMLElement, label: string): Promise<void> {
  const target = [...root.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label ||
      candidate.getAttribute('aria-label') === label,
  );
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  await act(async () => target.click());
}

async function inputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function chooseWithin(
  container: HTMLElement,
  label: string,
): Promise<void> {
  const target = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing choice: ${label}`);
  await act(async () => target.click());
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Log screen accessible persistence behavior', () => {
  it('renders tracker editors and persists flow, intimacy, medication, and temperature choices', async () => {
    const { logRepo } = createLogRepository();
    const onPinnedTrackersChange = vi.fn();
    const root = await mount(logRepo, onPinnedTrackersChange);

    expect(root.querySelector('h1')?.textContent).toBe('Log');
    expect(root.querySelectorAll('.log-screen__form-card .log-editor')).toHaveLength(23);
    expect(root.textContent).toContain('A logged experience is never a signal of consent');

    const flow = card(root, 'Flow');
    await chooseWithin(flow, 'Heavy');
    await chooseWithin(flow, 'Clots over 2.5 cm');
    await clickButton(flow, 'Save Flow');
    await waitFor(root, () => root.querySelector('[role="status"]')?.textContent === 'Saved privately.');
    await expect(logRepo.getDay(DATE)).resolves.toMatchObject({
      flow: 'heavy',
      heavy_detail: ['clots_over_2_5cm'],
    });
    expect(root.querySelector('.log-screen__summary-list')?.textContent).toContain('Heavy');

    const sex = card(root, 'Sex and intimacy');
    const pinnedSex = [...root.querySelectorAll('[aria-label="Pinned trackers"] button')].find(
      (candidate) => candidate.textContent?.includes('Sex and intimacy'),
    );
    if (!pinnedSex) throw new Error('Pinned intimacy tracker is missing.');
    await act(async () => pinnedSex.click());
    await clickButton(sex, 'Add event');
    await chooseWithin(sex, 'Vaginal');
    await chooseWithin(sex, 'External condom');
    await clickButton(sex, 'Save Sex and intimacy');
    await waitFor(root, () => root.querySelector('[role="status"]')?.textContent === 'Saved privately.');
    await expect(logRepo.getDay(DATE)).resolves.toMatchObject({
      sex: [{ activity: ['vaginal'], protection: ['external_condom'] }],
    });

    const medication = card(root, 'Medication');
    const medicationTab = [...root.querySelectorAll('[aria-label="Pinned trackers"] button')].find(
      (candidate) => candidate.textContent?.includes('Medication'),
    );
    if (!medicationTab) throw new Error('Pinned medication tracker is missing.');
    await act(async () => medicationTab.click());
    await clickButton(medication, 'Add medication');
    const medicationName = medication.querySelector<HTMLInputElement>('input[type="text"]');
    if (!medicationName) throw new Error('Medication name input is missing.');
    await inputValue(medicationName, 'synthetic supplement');
    await clickButton(medication, 'Save Medication');
    await waitFor(root, () => root.querySelector('[role="status"]')?.textContent === 'Saved privately.');
    await expect(logRepo.getDay(DATE)).resolves.toMatchObject({
      medication: [{ name: 'synthetic supplement', taken: false }],
    });

    const bbt = card(root, 'Basal body temperature');
    const bbtTab = [...root.querySelectorAll('[aria-label="Pinned trackers"] button')].find(
      (candidate) => candidate.textContent?.includes('Basal body temperature'),
    );
    if (!bbtTab) throw new Error('Pinned temperature tracker is missing.');
    await act(async () => bbtTab.click());
    const temperature = [...bbt.querySelectorAll<HTMLInputElement>('input[type="number"]')][0];
    const measuredAt = bbt.querySelector<HTMLInputElement>('input[type="time"]');
    if (!temperature || !measuredAt) throw new Error('Temperature reading fields are missing.');
    await inputValue(temperature, '36.5');
    await inputValue(measuredAt, '07:15');
    await clickButton(bbt, 'Save Basal body temperature');
    await waitFor(root, () => root.querySelector('[role="status"]')?.textContent === 'Saved privately.');
    await expect(logRepo.getDay(DATE)).resolves.toMatchObject({
      bbt: { valueC: 36.5, measuredAt: '07:15', disturbances: [] },
    });

    await clickButton(root, 'Customize trackers');
    await clickButton(root, 'Pin Weight');
    expect(onPinnedTrackersChange).toHaveBeenLastCalledWith([
      'flow',
      'notes',
      'sex',
      'medication',
      'bbt',
      'weight',
    ]);
  });

  it('keeps unsaved edits on invalid dates and reports repository save failures privately', async () => {
    const { logRepo } = createLogRepository();
    const root = await mount(logRepo);
    const notes = card(root, 'Notes');
    const notesTab = [...root.querySelectorAll('[aria-label="Pinned trackers"] button')].find(
      (candidate) => candidate.textContent?.trim() === 'Notes',
    );
    if (!notesTab) throw new Error('Pinned notes tracker is missing.');
    await act(async () => notesTab.click());

    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    const note = notes.querySelector<HTMLTextAreaElement>('textarea');
    if (!date || !note) throw new Error('Log date or note field is missing.');
    await inputValue(note, 'synthetic unsaved note');
    await inputValue(date, 'not-a-calendar-date');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose a valid calendar date.',
    );
    expect(root.querySelector<HTMLButtonElement>('.log-screen__day-actions button')?.disabled).toBe(
      true,
    );

    await inputValue(date, DATE);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    const nextDate = '2035-04-06';
    await inputValue(date, nextDate);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'unsaved edits. Discard them and open',
    );
    await clickButton(root, 'Stay on this day');
    expect(root.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
      'synthetic unsaved note',
    );
    await inputValue(date, nextDate);
    await clickButton(root, 'Discard edits and open date');
    await waitFor(root, () => root.querySelector<HTMLInputElement>('input[type="date"]')?.value === nextDate);
    await expect(logRepo.getDay(nextDate as LocalDate)).resolves.toBeUndefined();

    vi.spyOn(logRepo, 'setTracker').mockRejectedValueOnce(
      new Error('synthetic private log write failure'),
    );
    const flowTab = [...root.querySelectorAll('[aria-label="Pinned trackers"] button')].find(
      (candidate) => candidate.textContent?.trim() === 'Flow',
    );
    if (!flowTab) throw new Error('Pinned flow tracker is missing.');
    await act(async () => flowTab.click());
    const flow = card(root, 'Flow');
    await chooseWithin(flow, 'Medium');
    await clickButton(flow, 'Save Flow');
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'That log could not be saved. It remains private',
    );
    await expect(logRepo.getDay(nextDate as LocalDate)).resolves.toBeUndefined();
  });
});
