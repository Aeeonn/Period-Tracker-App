import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { parse } from '../../../../src/lib/localdate/index.ts';
import {
  saveQuickLogEntry,
  undoQuickLogEntry,
} from '../../../../src/ui/screens/quicklog/quick-log-model.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-quicklog-device' as DeviceId;
const DATE = parse('2032-04-05');
if (!DATE) throw new Error('Synthetic quick-log date did not parse.');

function createFixture() {
  const store = new MemoryRecordStore();
  const logRepo = createLogRepo(store, {
    deviceId: DEVICE_ID,
    nowMs: () => 1_800_000_000_000,
  });
  return { logRepo, store };
}

describe('quick-log persistence and undo', () => {
  it('merges a symptom and undo restores only the previous value for that tracker', async () => {
    const { logRepo } = createFixture();
    await logRepo.setTracker(DATE, 'flow', 'medium');
    await logRepo.setTracker(DATE, 'symptoms_body', ['fatigue']);
    await logRepo.setTracker(DATE, 'desire', 'high');

    const receipt = await saveQuickLogEntry(logRepo, DATE, (day) => ({
      tracker: 'symptoms_body',
      value: [...(day?.symptoms_body ?? []), 'cramps'],
    }));
    await logRepo.setTracker(DATE, 'mood', ['calm']);

    expect(await logRepo.getDay(DATE)).toMatchObject({
      flow: 'medium',
      symptoms_body: ['fatigue', 'cramps'],
      desire: 'high',
      mood: ['calm'],
    });
    await expect(undoQuickLogEntry(logRepo, DATE, receipt)).resolves.toBe(true);
    expect(await logRepo.getDay(DATE)).toMatchObject({
      flow: 'medium',
      symptoms_body: ['fatigue'],
      desire: 'high',
      mood: ['calm'],
    });
  });

  it('undo clears only a newly added tracker and preserves later changes elsewhere', async () => {
    const { logRepo } = createFixture();
    await logRepo.setTracker(DATE, 'symptoms_body', ['headache']);
    const receipt = await saveQuickLogEntry(logRepo, DATE, () => ({
      tracker: 'desire',
      value: 'low',
    }));
    await logRepo.setTracker(DATE, 'flow', 'light');

    await expect(undoQuickLogEntry(logRepo, DATE, receipt)).resolves.toBe(true);
    expect(await logRepo.getDay(DATE)).toMatchObject({
      flow: 'light',
      symptoms_body: ['headache'],
    });
    expect((await logRepo.getDay(DATE))?.desire).toBeUndefined();
  });

  it('does not undo over a newer value for the same tracker', async () => {
    const { logRepo } = createFixture();
    const receipt = await saveQuickLogEntry(logRepo, DATE, () => ({
      tracker: 'desire',
      value: 'low',
    }));
    await logRepo.setTracker(DATE, 'desire', 'high');

    await expect(undoQuickLogEntry(logRepo, DATE, receipt)).resolves.toBe(false);
    expect((await logRepo.getDay(DATE))?.desire).toBe('high');
  });
});
