// synthetic: true - cycle engine properties and regression fixtures only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { EngineInput, EngineParams } from '../../../src/contracts/engine-api.ts';
import type { LocalDate } from '../../../src/contracts/localdate.ts';
import { addDays, compare, parse } from '../../../src/lib/localdate/index.ts';
import { hashEngineParams, runEngine } from '../../../src/engine/index.ts';
import { PARAMS_V1 } from '../../../src/engine/params.ts';

interface RawScenario {
  readonly today: string;
  readonly starts?: readonly string[];
  readonly lifeStage?: string;
  readonly typicalCycleLength?: number;
  readonly typicalPeriodLength?: number;
  readonly contraception?: readonly unknown[];
  readonly pregnancies?: readonly unknown[];
}

function date(text: string): LocalDate {
  const parsed = parse(text);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${text}`);
  return parsed;
}

function inputFor(scenario: RawScenario): EngineInput {
  const today = date(scenario.today);
  const dayLogs = (scenario.starts ?? []).flatMap((start) =>
    Array.from({ length: 5 }, (_, offset) => ({
      localDate: addDays(date(start), offset),
      flow: 'medium' as const,
    })),
  );
  return {
    today,
    profile: {
      lifeStage: (scenario.lifeStage ?? 'cycle') as EngineInput['profile']['lifeStage'],
      contraception: (scenario.contraception ?? []) as EngineInput['profile']['contraception'],
      ...(scenario.typicalCycleLength === undefined
        ? {}
        : { typicalCycleLength: scenario.typicalCycleLength }),
      ...(scenario.typicalPeriodLength === undefined
        ? {}
        : { typicalPeriodLength: scenario.typicalPeriodLength }),
    },
    dayLogs: dayLogs as EngineInput['dayLogs'],
    episodesOverride: [],
    pregnancies: (scenario.pregnancies ?? []) as EngineInput['pregnancies'],
    coupleEntriesAllowedForInsights: [],
  };
}

function historyInput(intervals: readonly number[]): EngineInput {
  const starts = [date('2024-01-01')];
  for (const interval of intervals) {
    const previous = starts[starts.length - 1];
    if (previous === undefined) throw new Error('Expected a preceding period start');
    starts.push(addDays(previous, interval));
  }
  const last = starts[starts.length - 1];
  if (last === undefined) throw new Error('Expected one synthetic period start');
  const today = addDays(last, 10);
  return inputFor({ today, starts: starts.map(String) });
}

function assertProperty<TArgs extends unknown[]>(
  property: fc.IProperty<TArgs>,
  seed: number,
): void {
  fc.assert(property, { seed, numRuns: 1_000, endOnFailure: true });
}

const intervalsArbitrary = fc.array(fc.integer({ min: 15, max: 90 }), {
  minLength: 0,
  maxLength: 10,
});
const historyArbitrary = intervalsArbitrary.map(historyInput);

describe('P1 cycle invariants and regression properties', () => {
  it('T-CON-15 keeps the expected period length when a mood-only log is added on an unlogged day', () => {
    const periodDays = (start: string, count: number): EngineInput['dayLogs'] =>
      Array.from({ length: count }, (_, offset) => ({
        localDate: addDays(date(start), offset),
        flow: 'medium' as const,
      }));
    const today = date('2026-03-02');
    const input: EngineInput = {
      today,
      profile: { lifeStage: 'cycle', contraception: [] },
      dayLogs: [
        ...periodDays('2026-01-01', 4),
        ...periodDays('2026-01-30', 6),
        ...periodDays('2026-03-01', 1),
      ],
      episodesOverride: [],
      pregnancies: [],
      coupleEntriesAllowedForInsights: [],
    };
    const baseline = runEngine(input);
    const withMoodOnlyLog = runEngine({
      ...input,
      dayLogs: [...input.dayLogs, { localDate: today, mood: ['calm'] }],
    });

    expect(baseline.prediction.kind).toBe('prediction');
    expect(withMoodOnlyLog.prediction.kind).toBe('prediction');
    if (
      baseline.prediction.kind !== 'prediction' ||
      withMoodOnlyLog.prediction.kind !== 'prediction'
    ) {
      throw new Error('Expected both synthetic inputs to produce a prediction');
    }
    expect(baseline.prediction.expectedPeriodLength).toBe(5);
    expect(withMoodOnlyLog.prediction.expectedPeriodLength).toBe(5);
    expect(withMoodOnlyLog.prediction).toStrictEqual(baseline.prediction);
  });

  it('E1: returns byte-identical output for identical input and params', () => {
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        expect(JSON.stringify(runEngine(input))).toBe(JSON.stringify(runEngine(input)));
      }),
      20261030,
    );
  });

  it('E2: output is independent of day-log order', () => {
    const flows = fc.array(fc.constantFrom('none', 'spotting', 'light', 'medium', 'heavy'), {
      minLength: 1,
      maxLength: 24,
    });
    const logs = flows.chain((values) => {
      const today = date('2026-10-30');
      const dayLogs = values.map((flow, index) => ({
        localDate: addDays(today, index + 1 - values.length),
        flow,
      }));
      return fc.shuffledSubarray(dayLogs, {
        minLength: dayLogs.length,
        maxLength: dayLogs.length,
      });
    });
    assertProperty(
      fc.property(logs, (dayLogs) => {
        const input = inputFor({ today: '2026-10-30' });
        const ordered = { ...input, dayLogs: dayLogs as EngineInput['dayLogs'] };
        const reversed = { ...input, dayLogs: [...dayLogs].reverse() as EngineInput['dayLogs'] };
        expect(JSON.stringify(runEngine(ordered))).toBe(JSON.stringify(runEngine(reversed)));
      }),
      20261031,
    );
  });

  it('E3: every unsuppressed prediction has an ordered window containing its center', () => {
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        const prediction = runEngine(input).prediction;
        if (prediction.kind === 'prediction') {
          expect(compare(prediction.lo, prediction.center)).toBeLessThanOrEqual(0);
          expect(compare(prediction.center, prediction.hi)).toBeLessThanOrEqual(0);
        }
      }),
      20261101,
    );
  });

  it('E4/T-UX-04: chance values never use zero, none, or a no-risk label', () => {
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        const values = Object.values(runEngine(input).chanceByDay);
        expect(values.length).toBeGreaterThan(0);
        expect(values.every((value) => !['0', 'none', 'safe'].includes(value.toLowerCase()))).toBe(
          true,
        );
      }),
      20261102,
    );
  });

  it('E5: adding a future log does not change current output', () => {
    assertProperty(
      fc.property(historyArbitrary, fc.integer({ min: 1, max: 90 }), (input, daysAhead) => {
        const futureLog = {
          localDate: addDays(input.today, daysAhead),
          flow: 'heavy' as const,
        };
        expect(JSON.stringify(runEngine(input))).toBe(
          JSON.stringify(runEngine({ ...input, dayLogs: [...input.dayLogs, futureLog] })),
        );
      }),
      20261103,
    );
  });

  it('E6: version and canonical params hash accompany every prediction result', () => {
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        const output = runEngine(input, PARAMS_V1);
        const reorderedParams = Object.fromEntries(
          Object.entries(PARAMS_V1).reverse(),
        ) as unknown as EngineParams;
        expect(output.engineVersion).toBe('cycle-engine/1.0.0');
        expect(output.paramsHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
        expect(hashEngineParams(reorderedParams)).toBe(output.paramsHash);
      }),
      20261104,
    );
  });

  it('E7: calendar arithmetic stays on LocalDate helpers and never builds Date from a date', () => {
    const source = [
      readFileSync(new URL('../../../src/engine/index.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../src/engine/episodes/index.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../src/engine/cycle/prediction.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../src/engine/cycle/fertility.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../src/engine/cycle/shared.ts', import.meta.url), 'utf8'),
    ].join('\n');
    expect(source).not.toMatch(/new Date\s*\(|Date\.(?:parse|UTC)\s*\(/);
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        const output = runEngine(input);
        for (const day of Object.keys(output.chanceByDay)) expect(parse(day)).not.toBeNull();
        for (const episode of output.episodes) {
          expect(parse(String(episode.start))).not.toBeNull();
          expect(parse(String(episode.end))).not.toBeNull();
        }
      }),
      20261105,
    );
  });

  it('T-CON-15: desire, energy, and mood logs do not affect cycle or fertility outputs', () => {
    assertProperty(
      fc.property(historyArbitrary, (input) => {
        const alteredLogs = input.dayLogs.map((log) => ({
          ...log,
          desire: 'high',
          energy: 'high',
          mood: ['anxious'],
        }));
        const nonFlowLogs = [
          { localDate: addDays(input.today, -2), desire: 'high' },
          { localDate: addDays(input.today, -1), energy: 'high' },
          { localDate: input.today, mood: ['anxious'] },
        ] as unknown as EngineInput['dayLogs'];
        for (const log of nonFlowLogs) {
          expect(input.dayLogs.some((existing) => existing.localDate === log.localDate)).toBe(
            false,
          );
        }
        const changedInput = {
          ...input,
          dayLogs: [...alteredLogs, ...nonFlowLogs] as unknown as EngineInput['dayLogs'],
        };
        const baseline = runEngine(input);
        const altered = runEngine(changedInput);
        expect(altered.prediction).toStrictEqual(baseline.prediction);
        expect(altered.fertility).toStrictEqual(baseline.fertility);
        expect(altered.chanceByDay).toStrictEqual(baseline.chanceByDay);
      }),
      20261106,
    );
  });
});
