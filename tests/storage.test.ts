import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import * as storage from '../src/data/storage.ts';
import { DEFAULT_SETTINGS } from '../src/data/types.ts';
import { date } from '../src/lib/date.ts';

afterEach(async () => {
  await storage.deleteEverything();
});

describe('storage', () => {
  it('saves, cleans and deletes empty days', async () => {
    await storage.putDay({ date: date('2026-01-01'), flow: 'light', symptoms: [], notes: '  ' });
    expect(await storage.getDay(date('2026-01-01'))).toEqual({ date: '2026-01-01', flow: 'light' });
    await storage.putDay({ date: date('2026-01-01'), symptoms: [] });
    expect(await storage.getDay(date('2026-01-01'))).toBeUndefined();
  });

  it('round-trips an export and rejects other files', async () => {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, contraception: 'hormonal_iud' });
    await storage.putDay({ date: date('2026-01-02'), desire: 'high', sex: { comfort: 'okay' } });
    await storage.putDay({ date: date('2026-01-01'), water: 6 });
    const file = await storage.exportData(date('2026-01-03'));
    expect(file.days.map((day) => day.date)).toEqual(['2026-01-01', '2026-01-02']);

    await storage.deleteEverything();
    expect(await storage.getAllDays()).toEqual([]);

    const parsed = storage.readExport(JSON.parse(JSON.stringify(file)));
    expect(typeof parsed).toBe('object');
    await storage.importData(parsed as Exclude<typeof parsed, string>);
    expect(await storage.getAllDays()).toHaveLength(2);
    expect((await storage.getSettings())?.contraception).toBe('hormonal_iud');

    expect(storage.readExport({ app: 'other' })).toBe('This is not a Flo export file.');
    expect(storage.readExport({ ...file, days: [{ date: '2026-02-30' }] })).toBe(
      'The file has an invalid date.',
    );
  });

  it('deletes everything including sharing state', async () => {
    await storage.saveSettings(DEFAULT_SETTINGS);
    await storage.saveShare({ role: 'partner', coupleId: 'a', readKey: 'b' });
    await storage.deleteEverything();
    expect(await storage.getSettings()).toBeUndefined();
    expect(await storage.getShare()).toBeUndefined();
  });
});
