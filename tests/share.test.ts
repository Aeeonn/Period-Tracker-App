import { describe, expect, it } from 'vitest';
import type { DayLog } from '../src/data/types.ts';
import { runEngine } from '../src/engine/index.ts';
import { addDays, date } from '../src/lib/date.ts';
import {
  newShareKeys,
  open,
  pairingCode,
  parsePairingCode,
  seal,
  sha256Hex,
} from '../src/share/crypto.ts';
import { buildSnapshot, isSnapshot } from '../src/share/snapshot.ts';

const today = date('2026-03-10');
const days: DayLog[] = [
  { date: date('2026-03-01'), flow: 'medium', pain: 'mild', notes: 'private' },
  { date: date('2026-03-02'), flow: 'light' },
  {
    date: date('2026-03-08'),
    desire: 'high',
    sex: { comfort: 'comfortable', satisfaction: 'high' },
    mood: ['loving'],
    water: 7,
    notes: 'private too',
  },
  { date: addDays(today, -200), flow: 'heavy' },
];
const output = runEngine({ today, days, contraception: 'none', cycleLength: 28 });

describe('buildSnapshot', () => {
  it('shares nothing until a category is switched on, and never notes', () => {
    const snapshot = buildSnapshot({ output, days, categories: [], paused: false, now: 1 });
    expect(snapshot.days).toEqual([]);
    expect(snapshot.period).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });

  it('shares only the chosen categories from the last six months', () => {
    const snapshot = buildSnapshot({
      output,
      days,
      categories: ['sex', 'desire'],
      paused: false,
      now: 1,
    });
    expect(snapshot.days).toEqual([
      { date: '2026-03-08', desire: 'high', sex: { comfort: 'comfortable', satisfaction: 'high' } },
    ]);
    expect(snapshot.period).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });

  it('includes the period summary only with the period category', () => {
    const snapshot = buildSnapshot({ output, days, categories: ['period'], paused: false, now: 1 });
    expect(snapshot.period?.cycleStart).toBe('2026-03-01');
    expect(snapshot.period?.prediction?.center).toBe('2026-03-29');
    expect(snapshot.days.map((day) => day.date)).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('never includes a fertile window on a hormonal method', () => {
    const hormonal = runEngine({ today, days, contraception: 'hormonal_iud', cycleLength: 28 });
    const snapshot = buildSnapshot({
      output: hormonal,
      days,
      categories: ['fertility', 'period'],
      paused: false,
      now: 1,
    });
    expect(snapshot.fertility).toBeUndefined();
    const copper = runEngine({ today, days, contraception: 'none', cycleLength: 28 });
    expect(
      buildSnapshot({ output: copper, days, categories: ['fertility'], paused: false, now: 1 })
        .fertility,
    ).toBeDefined();
  });

  it('carries no data while paused', () => {
    const snapshot = buildSnapshot({
      output,
      days,
      categories: ['period', 'sex', 'mood', 'habits'],
      paused: true,
      now: 1,
    });
    expect(snapshot).toEqual({
      v: 1,
      createdAt: 1,
      madeOn: today,
      paused: true,
      categories: [],
      days: [],
    });
  });
});

describe('share crypto', () => {
  it('round-trips a snapshot and rejects the wrong key or couple', async () => {
    const keys = newShareKeys();
    const snapshot = buildSnapshot({ output, days, categories: ['mood'], paused: false, now: 5 });
    const box = await seal(keys, snapshot);
    expect(box.ct).not.toContain('loving');
    const opened = await open(keys, box);
    expect(isSnapshot(opened)).toBe(true);
    expect(opened).toEqual(snapshot);

    const other = newShareKeys();
    expect(await open({ ...keys, readKey: other.readKey }, box)).toBeNull();
    expect(await open({ ...keys, coupleId: other.coupleId }, box)).toBeNull();
    const tampered = { ...box, ct: (box.ct[0] === 'A' ? 'B' : 'A') + box.ct.slice(1) };
    expect(await open(keys, tampered)).toBeNull();
  });

  it('puts only the couple id and read key in the pairing code', () => {
    const keys = newShareKeys();
    const code = pairingCode(keys);
    expect(code).not.toContain(keys.writeKey);
    expect(parsePairingCode(` ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual({
      coupleId: keys.coupleId,
      readKey: keys.readKey,
    });
    expect(parsePairingCode('flo1.abc.def')).toBeNull();
    expect(parsePairingCode(code.replace('flo1', 'flo2'))).toBeNull();
  });

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
