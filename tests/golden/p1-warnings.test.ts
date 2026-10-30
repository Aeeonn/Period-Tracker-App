// synthetic: true - hand-derived A11 TV-W reference cases only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../../src/contracts/engine-api.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import type { WarningRuleId, WarningSeverity } from '../../src/contracts/enums.ts';
import { contentSourcesById } from '../../src/content/index.ts';
import { runEngine } from '../../src/engine/index.ts';
import { calculateWarnings, type A11Warning } from '../../src/engine/warnings/index.ts';
import { deriveEpisodes } from '../../src/engine/episodes/index.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';

interface RawDayLog {
  readonly localDate: string;
  readonly flow?: string;
  readonly heavy_detail?: readonly string[];
  readonly symptoms_body?: readonly string[];
  readonly mood?: readonly string[];
  readonly sex?: readonly {
    readonly activity: readonly string[];
    readonly protection: readonly string[];
    readonly bleeding_after?: string;
  }[];
}

interface RawContraception {
  readonly method: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly regimen: {
    readonly activeDays: number;
    readonly breakDays: number;
    readonly continuous: boolean;
  };
}

interface RawScenario {
  readonly today: string;
  readonly lifeStage?: string;
  readonly birthYear?: number | null;
  readonly starts?: readonly string[];
  readonly periodDays?: readonly number[];
  readonly contraception?: readonly RawContraception[];
  readonly extraLogs?: readonly RawDayLog[];
}

interface RawWarning {
  readonly ruleId: WarningRuleId;
  readonly severity: WarningSeverity;
  readonly dismissible: boolean;
  readonly scopeStart: string;
  readonly evidenceDates: readonly string[];
  readonly sourceIds: readonly string[];
}

interface GoldenVector {
  readonly id: string;
  readonly scenario: string;
  readonly expected: readonly RawWarning[];
}

interface GoldenFixture {
  readonly synthetic: true;
  readonly provenance: string;
  readonly source: string;
  readonly scenarios: Readonly<Record<string, RawScenario>>;
  readonly vectors: readonly GoldenVector[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./p1-warnings.json', import.meta.url), 'utf8'),
) as GoldenFixture;

function localDate(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function inputFor(scenario: RawScenario): EngineInput {
  const today = localDate(scenario.today);
  const logs = new Map<string, RawDayLog>();
  for (const [index, start] of (scenario.starts ?? []).entries()) {
    const periodDays = scenario.periodDays?.[index] ?? 1;
    for (let offset = 0; offset < periodDays; offset += 1) {
      const date = addDays(localDate(start), offset);
      logs.set(date, { localDate: date, flow: 'medium' });
    }
  }
  for (const extra of scenario.extraLogs ?? []) {
    logs.set(extra.localDate, { ...logs.get(extra.localDate), ...extra });
  }
  const contraception = (scenario.contraception ?? []).map((state) => ({
    method: state.method as EngineInput['profile']['contraception'][number]['method'],
    startDate: localDate(state.startDate),
    ...(state.endDate === undefined ? {} : { endDate: localDate(state.endDate) }),
    regimen: state.regimen,
  }));
  return {
    today,
    profile: {
      lifeStage: (scenario.lifeStage ?? 'cycle') as EngineInput['profile']['lifeStage'],
      contraception,
      ...(scenario.birthYear == null ? {} : { birthYear: scenario.birthYear }),
    },
    dayLogs: [...logs.values()]
      .sort((left, right) => left.localDate.localeCompare(right.localDate))
      .map((log) => ({ ...log, localDate: localDate(log.localDate) })) as EngineInput['dayLogs'],
    episodesOverride: [],
    pregnancies: [],
    coupleEntriesAllowedForInsights: [],
  };
}

function toWarning(raw: RawWarning): A11Warning {
  return {
    ...raw,
    scopeStart: localDate(raw.scopeStart),
    evidenceDates: raw.evidenceDates.map(localDate),
    sourceIds: raw.sourceIds as A11Warning['sourceIds'],
  };
}

describe('P1 A11 warning golden vectors', () => {
  it('records synthetic provenance and all specified TV-W vectors', () => {
    expect(fixture.synthetic).toBe(true);
    expect(fixture.source).toBe('docs/plan/algorithms-spec.md A11');
    expect(fixture.provenance).toContain('hand-derived');
    expect(fixture.vectors.map(({ id }) => id)).toEqual([
      'TV-W1',
      'TV-W2',
      'TV-W3',
      'TV-W3b',
      'TV-W4',
      'TV-W5',
      'TV-W6',
      'TV-W7',
      'TV-W8',
      'TV-W9',
      'TV-W10',
      'TV-W11',
      'TV-W12',
      'CAP-W01-D',
      'CAP-W01-D+1',
      'CAP-W01-D+2',
      'CAP-W01-old-only',
    ]);
  });

  it.each(fixture.vectors)(
    '$id matches its A11 warning result and EngineOutput wiring',
    (vector) => {
      const scenario = fixture.scenarios[vector.scenario];
      if (scenario === undefined) throw new Error(`Missing synthetic scenario ${vector.scenario}`);
      const input = inputFor(scenario);
      const episodes = deriveEpisodes(input);
      const output = runEngine(input);
      const ruleWarnings = calculateWarnings(input, episodes, output.cycles);
      expect(ruleWarnings).toStrictEqual(vector.expected.map(toWarning));
      expect(output.warnings).toStrictEqual(ruleWarnings);
      for (const warning of ruleWarnings) {
        expect(warning.sourceIds.length).toBeGreaterThan(0);
        for (const sourceId of warning.sourceIds) {
          expect(contentSourcesById[sourceId]).toBeDefined();
        }
      }
    },
  );
});
