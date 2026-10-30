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
  readonly periodLengths?: readonly number[];
  readonly missingFlowMasks?: readonly number[];
  readonly lifeStage?: EngineInput['profile']['lifeStage'];
  readonly birthYear?: number;
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
  const dayLogs = (scenario.starts ?? []).flatMap((start, index) => {
    const periodLength = scenario.periodLengths?.[index] ?? 5;
    const missingFlowMask = scenario.missingFlowMasks?.[index] ?? 0;
    return Array.from({ length: periodLength }, (_, offset) => ({
      localDate: addDays(date(start), offset),
      flow: 'medium' as const,
    })).filter((_, offset) => (missingFlowMask & (1 << offset)) === 0);
  });
  return {
    today,
    profile: {
      lifeStage: scenario.lifeStage ?? 'cycle',
      contraception: (scenario.contraception ?? []) as EngineInput['profile']['contraception'],
      ...(scenario.birthYear === undefined ? {} : { birthYear: scenario.birthYear }),
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

interface GeneratedHistory {
  readonly intervals: readonly number[];
  readonly periodLengths: readonly number[];
  readonly missingFlowMasks: readonly number[];
  readonly daysAfterLastStart: number;
  readonly lifeStage: EngineInput['profile']['lifeStage'];
  readonly hormonalMode: 'none' | 'active' | 'recently_stopped';
  readonly birthYear: number;
  readonly nonFlowMask: number;
}

function historyInput(history: GeneratedHistory): EngineInput {
  const starts = [date('2024-01-01')];
  for (const interval of history.intervals) {
    const previous = starts[starts.length - 1];
    if (previous === undefined) throw new Error('Expected a preceding period start');
    starts.push(addDays(previous, interval));
  }
  const first = starts[0];
  const last = starts[starts.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('Expected synthetic period starts');
  }
  const today = addDays(last, history.daysAfterLastStart);
  const contraception =
    history.hormonalMode === 'none'
      ? []
      : [
          {
            method: 'combined_pill',
            startDate: history.hormonalMode === 'active' ? first : addDays(today, -80),
            ...(history.hormonalMode === 'recently_stopped'
              ? { endDate: addDays(today, -10) }
              : {}),
            regimen: { activeDays: 21, breakDays: 7, continuous: false },
          },
        ];
  const pregnancies =
    history.lifeStage === 'pregnancy'
      ? [
          {
            id: 'synthetic-property-pregnancy',
            lmp: addDays(today, -120),
            eddSource: 'lmp',
            fetusCount: 1,
          },
        ]
      : history.lifeStage === 'postpartum'
        ? [
            {
              id: 'synthetic-property-birth',
              lmp: addDays(today, -300),
              eddSource: 'lmp',
              fetusCount: 1,
              endedOn: addDays(today, -30),
              outcome: 'birth',
            },
          ]
        : [];
  const input = inputFor({
    today: String(today),
    starts: starts.map(String),
    periodLengths: history.periodLengths,
    missingFlowMasks: history.missingFlowMasks,
    lifeStage: history.lifeStage,
    birthYear: history.birthYear,
    contraception,
    pregnancies,
  });
  const nonFlowLogs = [
    { localDate: addDays(first, -3), mood: ['calm'] },
    { localDate: addDays(first, -2), energy: 'high' },
    { localDate: addDays(first, -1), desire: 'high' },
  ].filter((_, index) => (history.nonFlowMask & (1 << index)) !== 0);
  return {
    ...input,
    dayLogs: [...input.dayLogs, ...nonFlowLogs] as unknown as EngineInput['dayLogs'],
  };
}

function assertProperty<TArgs extends unknown[]>(
  property: fc.IProperty<TArgs>,
  seed: number,
): void {
  fc.assert(property, { seed, numRuns: 1_000, endOnFailure: true });
}

const historyArbitrary = fc
  .record({
    intervals: fc.array(fc.integer({ min: 1, max: 120 }), { minLength: 0, maxLength: 10 }),
    periodLengths: fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 11 }),
    missingFlowMasks: fc.array(fc.integer({ min: 0, max: 255 }), {
      minLength: 1,
      maxLength: 11,
    }),
    daysAfterLastStart: fc.integer({ min: 10, max: 120 }),
    lifeStage: fc.constantFrom('cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'),
    hormonalMode: fc.constantFrom('none', 'active', 'recently_stopped'),
    birthYear: fc.integer({ min: 1975, max: 2008 }),
    nonFlowMask: fc.integer({ min: 1, max: 7 }),
  })
  .map(historyInput);

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

  it('E2: output is independent of day-log order across flow values', () => {
    const flowArbitrary = fc.constantFrom(
      'none',
      'spotting',
      'light',
      'medium',
      'heavy',
      'very_heavy',
    );
    const shuffledHistories = historyArbitrary.chain((baseInput) => {
      // Synthetic cycle spans can overlap; keep one log per date as required by the engine input contract.
      const uniqueLogsByDate = new Map<LocalDate, EngineInput['dayLogs'][number]>();
      for (const log of baseInput.dayLogs) {
        if (!uniqueLogsByDate.has(log.localDate)) uniqueLogsByDate.set(log.localDate, log);
      }
      const uniqueLogs = [...uniqueLogsByDate.values()];
      const existingFlowCount = uniqueLogs.filter(({ flow }) => flow !== undefined).length;
      return fc
        .tuple(
          fc.array(flowArbitrary, {
            minLength: existingFlowCount,
            maxLength: existingFlowCount,
          }),
          flowArbitrary,
        )
        .chain(([generatedFlows, tailFlow]) => {
          let flowIndex = 0;
          const generatedLogs = uniqueLogs.map((log) => {
            if (log.flow === undefined) return log;
            const flow = generatedFlows[flowIndex];
            if (flow === undefined) {
              throw new Error('Expected one generated flow value per flow log');
            }
            flowIndex += 1;
            return { ...log, flow };
          });
          const tailLog = {
            localDate: addDays(baseInput.today, -2),
            flow: tailFlow,
          };
          const input = {
            ...baseInput,
            dayLogs: [
              ...generatedLogs,
              tailLog,
              { localDate: addDays(baseInput.today, -1), flow: 'none' },
              { localDate: baseInput.today, flow: 'spotting' },
            ] as EngineInput['dayLogs'],
          };
          return fc
            .shuffledSubarray([...input.dayLogs], {
              minLength: input.dayLogs.length,
              maxLength: input.dayLogs.length,
            })
            .map((dayLogs) => ({ input, dayLogs }));
        });
    });
    assertProperty(
      fc.property(shuffledHistories, ({ input, dayLogs }) => {
        expect(JSON.stringify(runEngine(input))).toBe(
          JSON.stringify(runEngine({ ...input, dayLogs })),
        );
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
