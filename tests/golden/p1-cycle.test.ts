// synthetic: true - cycle engine reference vectors and generated histories only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  EngineInput,
  FertilityEstimate,
  PeriodPrediction,
  Suppressed,
} from '../../src/contracts/engine-api.ts';
import type { ChanceCategory } from '../../src/contracts/enums.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';
import { runEngine, hashEngineParams } from '../../src/engine/index.ts';
import { PARAMS_V1 } from '../../src/engine/params.ts';

interface RawScenario {
  readonly today: string;
  readonly starts?: readonly string[];
  readonly lifeStage?: string;
  readonly typicalCycleLength?: number;
  readonly typicalPeriodLength?: number;
  readonly contraception?: readonly unknown[];
  readonly pregnancies?: readonly unknown[];
}

interface CycleRow {
  readonly start: string;
  readonly nextStart: string;
  readonly length: number;
  readonly excludedBecause?: string;
  readonly missedLogPromptDate?: string;
}

interface ExpectedVector {
  readonly prediction?: PeriodPrediction | Suppressed;
  readonly fertility?: FertilityEstimate | Suppressed;
  readonly chanceDays?: Readonly<Record<string, ChanceCategory>>;
  readonly chanceEvery?: ChanceCategory;
  readonly cycleRows?: readonly CycleRow[];
  readonly explanationIncludes?: readonly string[];
}

interface GoldenVector {
  readonly id: string;
  readonly scenario: string;
  readonly expected: ExpectedVector;
}

interface GoldenFixture {
  readonly synthetic: true;
  readonly provenance: string;
  readonly source: string;
  readonly scenarios: Readonly<Record<string, RawScenario>>;
  readonly vectors: readonly GoldenVector[];
  readonly a5Assertions: {
    readonly suppressedCopy: readonly {
      readonly scenario: string;
      readonly category: ChanceCategory;
      readonly text: string;
    }[];
    readonly lower: {
      readonly scenario: string;
      readonly text: string;
      readonly planningRange: string;
    };
  };
}

const fixture = JSON.parse(
  readFileSync(new URL('./p1-cycle.json', import.meta.url), 'utf8'),
) as GoldenFixture;

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

function cycleRows(output: ReturnType<typeof runEngine>): CycleRow[] {
  return output.cycles.map((cycle) => ({
    start: cycle.start,
    nextStart: cycle.nextStart,
    length: cycle.length,
    ...(cycle.excludedBecause === undefined ? {} : { excludedBecause: cycle.excludedBecause }),
    ...(cycle.missedLogPromptDate === undefined
      ? {}
      : { missedLogPromptDate: cycle.missedLogPromptDate }),
  }));
}

describe('P1 cycle golden vectors', () => {
  it('records synthetic provenance and every named P1 reference vector', () => {
    expect(fixture.synthetic).toBe(true);
    expect(fixture.source).toBe('docs/plan/algorithms-spec.md A2, A4, A5, A16 (P1 rows)');
    expect(fixture.provenance).toContain('hand-derived');
    expect(fixture.vectors.map(({ id }) => id)).toEqual([
      'TV-P1',
      'TV-P5',
      'TV-P6',
      'TV-P2',
      'TV-P3',
      'TV-P4',
      'TV-P7',
      'TV-P8',
      'TV-F1',
      'TV-F2',
      'TV-F3',
      'TV-Q1',
      'TV-Q2',
      'TV-Q3',
      'TV-Q4',
      'TV-Q5',
      'TV-Q6',
      'TV-K2',
      'TV-K3',
      'A16-copper-IUD',
      'A16-hormonal-3',
    ]);
  });

  it.each(fixture.vectors)('$id matches its specified engine result', (vector) => {
    const scenario = fixture.scenarios[vector.scenario];
    if (scenario === undefined) throw new Error(`Missing scenario ${vector.scenario}`);
    const output = runEngine(inputFor(scenario));
    const expected = vector.expected;
    if (expected.prediction !== undefined) {
      expect(output.prediction).toStrictEqual(expected.prediction);
    }
    if (expected.fertility !== undefined) {
      expect(output.fertility).toStrictEqual(expected.fertility);
    }
    if (expected.chanceDays !== undefined) {
      for (const [day, category] of Object.entries(expected.chanceDays)) {
        expect(output.chanceByDay[date(day)]).toBe(category);
      }
    }
    if (expected.chanceEvery !== undefined) {
      const categories = Object.values(output.chanceByDay);
      expect(categories.length).toBeGreaterThan(0);
      expect(new Set(categories)).toEqual(new Set([expected.chanceEvery]));
    }
    if (expected.cycleRows !== undefined) {
      expect(cycleRows(output)).toStrictEqual(expected.cycleRows);
    }
    if (expected.explanationIncludes !== undefined) {
      const explanations = JSON.stringify(output.explanations);
      for (const text of expected.explanationIncludes) expect(explanations).toContain(text);
    }
    expect(output.engineVersion).toBe('cycle-engine/1.0.0');
    expect(output.paramsHash).toBe(hashEngineParams(PARAMS_V1));
  });
});

describe('A5 fixed explanatory copy', () => {
  it.each(fixture.a5Assertions.suppressedCopy)(
    '$scenario maps its suppression to the named category and fixed text',
    ({ scenario: scenarioName, category, text }) => {
      const scenario = fixture.scenarios[scenarioName];
      if (scenario === undefined) throw new Error(`Missing scenario ${scenarioName}`);
      const output = runEngine(inputFor(scenario));
      const explanation = output.explanations.find(
        (item) => item.topic === 'chance' && item.messageKey === 'chance.suppressed',
      );
      expect(explanation?.values).toMatchObject({ category, text });
    },
  );

  it('uses the fixed lower-category text and planning-range limitation', () => {
    const scenario = fixture.scenarios[fixture.a5Assertions.lower.scenario];
    if (scenario === undefined) throw new Error('Missing A5 lower-category scenario');
    const output = runEngine(inputFor(scenario));
    const chance = output.explanations.find((item) => item.topic === 'chance');
    const prediction = output.explanations.find((item) => item.topic === 'prediction');
    expect(chance?.values.lowerText).toBe(fixture.a5Assertions.lower.text);
    expect(prediction?.values.planningRange).toBe(fixture.a5Assertions.lower.planningRange);
  });
});
