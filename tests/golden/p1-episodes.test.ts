// synthetic: true - A1/A3 reference vectors and deterministic edge fixtures only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { EngineInput, Episode } from '../../src/contracts/engine-api.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';
import { deriveEpisodes, estimatePeriodLength } from '../../src/engine/episodes/index.ts';

interface RawEpisode {
  readonly start: string;
  readonly end: string;
  readonly bleedingDays: number;
  readonly spottingDays: readonly string[];
  readonly assumedDays: readonly string[];
  readonly kind: Episode['kind'];
  readonly flags: Episode['flags'];
}

interface RawInput {
  readonly today: string;
  readonly profile: {
    readonly lifeStage: string;
    readonly contraception: readonly unknown[];
    readonly typicalPeriodLength?: number;
  };
  readonly dayLogs?: readonly {
    readonly localDate: string;
    readonly flow?: string;
    readonly lochia?: string;
  }[];
  readonly episodesOverride?: readonly { readonly localDate: string; readonly kind: string }[];
  readonly pregnancies?: readonly unknown[];
  readonly coupleEntriesAllowedForInsights?: readonly unknown[];
  readonly episodes?: readonly RawEpisode[];
}

interface EpisodeVector {
  readonly id: string;
  readonly operation: 'episodes';
  readonly input: RawInput;
  readonly expected: readonly RawEpisode[];
}

interface LengthVector {
  readonly id: string;
  readonly operation: 'periodLength';
  readonly input: RawInput;
  readonly expected: number;
}

type GoldenVector = EpisodeVector | LengthVector;

interface GoldenFixture {
  readonly synthetic: true;
  readonly provenance: string;
  readonly source: string;
  readonly vectors: readonly GoldenVector[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./p1-episodes.json', import.meta.url), 'utf8'),
) as GoldenFixture;
const episodeVectors = fixture.vectors.filter(
  (vector): vector is EpisodeVector => vector.operation === 'episodes',
);
const lengthVectors = fixture.vectors.filter(
  (vector): vector is LengthVector => vector.operation === 'periodLength',
);

function requireDate(text: string) {
  const date = parse(text);
  if (date === null) throw new Error(`Expected valid synthetic LocalDate: ${text}`);
  return date;
}

function toEpisode(raw: RawEpisode): Episode {
  return {
    ...raw,
    start: requireDate(raw.start),
    end: requireDate(raw.end),
    spottingDays: raw.spottingDays.map(requireDate),
    assumedDays: raw.assumedDays.map(requireDate),
  };
}

function toEngineInput(raw: RawInput): EngineInput {
  return {
    today: requireDate(raw.today),
    profile: raw.profile as unknown as EngineInput['profile'],
    dayLogs: (raw.dayLogs ?? []).map((log) => ({
      ...log,
      localDate: requireDate(log.localDate),
    })) as EngineInput['dayLogs'],
    episodesOverride: (raw.episodesOverride ?? []).map((override) => ({
      ...override,
      localDate: requireDate(override.localDate),
    })) as EngineInput['episodesOverride'],
    pregnancies: (raw.pregnancies ?? []) as EngineInput['pregnancies'],
    coupleEntriesAllowedForInsights: (raw.coupleEntriesAllowedForInsights ??
      []) as EngineInput['coupleEntriesAllowedForInsights'],
  };
}

function syntheticInput(
  today: string,
  options: {
    readonly typicalPeriodLength?: number;
    readonly contraception?: readonly unknown[];
    readonly dayLogs?: RawInput['dayLogs'];
    readonly episodesOverride?: RawInput['episodesOverride'];
  } = {},
): EngineInput {
  return toEngineInput({
    today,
    profile: {
      lifeStage: 'cycle',
      contraception: options.contraception ?? [],
      ...(options.typicalPeriodLength === undefined
        ? {}
        : { typicalPeriodLength: options.typicalPeriodLength }),
    },
    ...(options.dayLogs === undefined ? {} : { dayLogs: options.dayLogs }),
    ...(options.episodesOverride === undefined
      ? {}
      : { episodesOverride: options.episodesOverride }),
  });
}

function syntheticEpisode(
  start: string,
  bleedingDays: number,
  kind: Episode['kind'] = 'period',
): Episode {
  const date = requireDate(start);
  return {
    start: date,
    end: date,
    bleedingDays,
    spottingDays: [],
    assumedDays: [],
    kind,
    flags: [],
  };
}

describe('A1/A3 golden vectors TV-E1–TV-E5 and TV-L1–TV-L3', () => {
  it('records the exact synthetic reference vectors and provenance', () => {
    expect(fixture.synthetic).toBe(true);
    expect(fixture.source).toBe('docs/plan/algorithms-spec.md A1, A3');
    expect(fixture.provenance).toContain('before implementation');
    expect(fixture.vectors.map(({ id }) => id)).toEqual([
      'TV-E1',
      'TV-E2',
      'TV-E3',
      'TV-E4',
      'TV-E5',
      'TV-L1',
      'TV-L2',
      'TV-L3',
    ]);
  });

  it.each(episodeVectors)('$id: episode output matches the reference result', (vector) => {
    expect(deriveEpisodes(toEngineInput(vector.input))).toStrictEqual(
      vector.expected.map(toEpisode),
    );
  });

  it.each(lengthVectors)('$id: period length matches the reference result', (vector) => {
    const input = toEngineInput(vector.input);
    expect(estimatePeriodLength(input, (vector.input.episodes ?? []).map(toEpisode))).toBe(
      vector.expected,
    );
  });
});

describe('A1 deterministic ordering and edge cases', () => {
  it('keeps output invariant under fast-check shuffled log orders (E2)', () => {
    const today = '2026-01-20';
    const flows = fc.array(
      fc.constantFrom('none', 'spotting', 'light', 'medium', 'heavy', 'very_heavy'),
      {
        minLength: 1,
        maxLength: 20,
      },
    );
    const shuffledInputs = flows.chain((values) => {
      const dayLogs = values.map((flow, index) => ({
        localDate: addDays(requireDate(today), index + 1 - values.length),
        flow,
      }));
      return fc
        .shuffledSubarray(dayLogs, { minLength: dayLogs.length, maxLength: dayLogs.length })
        .map((shuffled) => ({ dayLogs, shuffled }));
    });

    fc.assert(
      fc.property(shuffledInputs, ({ dayLogs, shuffled }) => {
        const ordered = deriveEpisodes(syntheticInput(today, { dayLogs }));
        const reordered = deriveEpisodes(syntheticInput(today, { dayLogs: shuffled }));
        expect(reordered).toStrictEqual(ordered);
      }),
      { seed: 20261028, numRuns: 1_000, endOnFailure: true },
    );
  });

  it('never starts an episode on a spotting-only day without an override', () => {
    const today = '2026-01-20';
    const flows = fc.array(
      fc.constantFrom('none', 'spotting', 'light', 'medium', 'heavy', 'very_heavy'),
      {
        minLength: 1,
        maxLength: 20,
      },
    );

    fc.assert(
      fc.property(flows, (values) => {
        const dayLogs = values.map((flow, index) => ({
          localDate: addDays(requireDate(today), index + 1 - values.length),
          flow,
        }));
        const spottingOnlyDates = new Set(
          dayLogs.filter((log) => log.flow === 'spotting').map((log) => log.localDate),
        );
        const episodes = deriveEpisodes(syntheticInput(today, { dayLogs }));
        expect(episodes.every((episode) => !spottingOnlyDates.has(episode.start))).toBe(true);
      }),
      { seed: 20261029, numRuns: 1_000, endOnFailure: true },
    );
  });
  it('is unchanged by shuffled day-log order for every episode vector (E2)', () => {
    for (const vector of episodeVectors) {
      const input = toEngineInput(vector.input);
      const expected = vector.expected.map(toEpisode);
      const logs = [...input.dayLogs];
      const permutations = [
        [...logs].reverse(),
        [...logs.slice(1), ...logs.slice(0, 1)],
        [
          ...logs.filter((_, index) => index % 2 === 1),
          ...logs.filter((_, index) => index % 2 === 0),
        ],
      ];
      for (const dayLogs of permutations) {
        expect(deriveEpisodes({ ...input, dayLogs })).toStrictEqual(expected);
      }
    }
  });

  it('keeps a flow log marked not_start out of a new episode', () => {
    const input = syntheticInput('2026-01-04', {
      typicalPeriodLength: 5,
      dayLogs: [
        { localDate: '2026-01-01', flow: 'medium' },
        { localDate: '2026-01-04', flow: 'light' },
      ],
      episodesOverride: [{ localDate: '2026-01-04', kind: 'not_start' }],
    });
    expect(
      deriveEpisodes(input, {
        defaultPeriodLen: 5,
        minCycleLen: 15,
        expectedPeriodLength: 1,
      }),
    ).toStrictEqual([
      {
        start: requireDate('2026-01-01'),
        end: requireDate('2026-01-01'),
        bleedingDays: 1,
        spottingDays: [],
        assumedDays: [],
        kind: 'period',
        flags: [],
      },
    ]);
  });

  it('suppresses the entire contiguous flow run when its first day is not_start (A10d)', () => {
    const input = syntheticInput('2026-10-05', {
      dayLogs: [
        { localDate: '2026-10-01', flow: 'medium' },
        { localDate: '2026-10-02', flow: 'heavy' },
        { localDate: '2026-10-03', flow: 'light' },
        { localDate: '2026-10-04', flow: 'medium' },
        { localDate: '2026-10-05', flow: 'heavy' },
      ],
      episodesOverride: [{ localDate: '2026-10-01', kind: 'not_start' }],
    });
    expect(deriveEpisodes(input)).toEqual([]);
  });

  it('always opens a new episode for an explicit start override', () => {
    const input = syntheticInput('2026-01-03', {
      typicalPeriodLength: 5,
      dayLogs: [
        { localDate: '2026-01-01', flow: 'medium' },
        { localDate: '2026-01-03', flow: 'light' },
      ],
      episodesOverride: [{ localDate: '2026-01-03', kind: 'start' }],
    });
    expect(deriveEpisodes(input).map(({ start, flags }) => [start, flags])).toStrictEqual([
      [requireDate('2026-01-01'), []],
      [requireDate('2026-01-03'), ['short_interval']],
    ]);
  });

  it.each([
    ['combined_pill', '2026-09-21'],
    ['combined_pill', '2026-09-11'],
    ['patch', '2026-09-11'],
    ['ring', '2026-09-21'],
  ])('labels any active scheduled hormonal method bleed as withdrawal (A11b/c)', (method, date) => {
    const input = syntheticInput(date, {
      dayLogs: [{ localDate: date, flow: 'medium' }],
      contraception: [
        {
          method,
          startDate: '2026-09-01',
          endDate: '2026-12-31',
          regimen: { activeDays: 21, breakDays: 7, continuous: false },
        },
      ],
    });
    expect(deriveEpisodes(input)[0]?.kind).toBe('withdrawal');
  });

  it('does not also list a forced spotting start as spotting (F5)', () => {
    const input = syntheticInput('2026-09-10', {
      dayLogs: [{ localDate: '2026-09-10', flow: 'spotting' }],
      episodesOverride: [{ localDate: '2026-09-10', kind: 'start' }],
    });
    expect(deriveEpisodes(input)).toStrictEqual([
      {
        start: requireDate('2026-09-10'),
        end: requireDate('2026-09-10'),
        bleedingDays: 1,
        spottingDays: [],
        assumedDays: [],
        kind: 'period',
        flags: [],
      },
    ]);
  });

  it('keeps a lochia-only episode separate from natural period episodes', () => {
    const input = syntheticInput('2026-04-02', {
      dayLogs: [{ localDate: '2026-04-02', flow: 'none', lochia: 'light' }],
    });
    expect(deriveEpisodes(input).map(({ kind, bleedingDays }) => [kind, bleedingDays])).toEqual([
      ['postpartum_lochia', 1],
    ]);
  });

  it('ignores future flow logs', () => {
    const input = syntheticInput('2026-04-01', {
      dayLogs: [
        { localDate: '2026-04-01', flow: 'medium' },
        { localDate: '2026-04-02', flow: 'heavy' },
      ],
    });
    expect(
      deriveEpisodes(input).map(({ start, end, bleedingDays }) => [start, end, bleedingDays]),
    ).toEqual([[requireDate('2026-04-01'), requireDate('2026-04-01'), 1]]);
  });
});

describe('A1/A3 follow-ups D6 and D7', () => {
  it.each(['none', 'spotting'] as const)(
    'does not assume an explicitly logged %s day after a one-day start (D6)',
    (flow) => {
      const input = syntheticInput('2026-01-03', {
        dayLogs: [
          { localDate: '2026-01-01', flow: 'medium' },
          { localDate: '2026-01-02', flow },
        ],
      });
      expect(deriveEpisodes(input)[0]?.assumedDays).toEqual([requireDate('2026-01-03')]);
    },
  );

  it('excludes short_interval episodes from A3 period-length statistics (D7)', () => {
    const input = syntheticInput('2026-04-01');
    const shortEpisode: Episode = {
      ...syntheticEpisode('2026-02-01', 10),
      flags: ['short_interval'],
    };
    expect(
      estimatePeriodLength(input, [
        syntheticEpisode('2026-01-01', 4),
        shortEpisode,
        syntheticEpisode('2026-03-01', 6),
      ]),
    ).toBe(5);
  });
});
describe('A3 period-length edge cases', () => {
  it('uses completed episodes for assumed days in the A1/A3 composition (A13a)', () => {
    const dates = [
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-12-01',
    ];
    const input = syntheticInput('2026-12-04', {
      dayLogs: dates.map((localDate) => ({ localDate, flow: 'medium' })),
    });
    const episodes = deriveEpisodes(input);
    expect(estimatePeriodLength(input, episodes)).toBe(3);
    expect(episodes[episodes.length - 1]?.assumedDays).toEqual([]);
  });

  it('assumes six days from the completed-history A3 estimate (A13d)', () => {
    const dates = [
      ...Array.from({ length: 7 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 7 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 7 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`),
      '2026-12-01',
    ];
    const input = syntheticInput('2026-12-07', {
      dayLogs: dates.map((localDate) => ({ localDate, flow: 'medium' })),
    });
    const episodes = deriveEpisodes(input);
    const latest = episodes[episodes.length - 1];
    expect(estimatePeriodLength(input, episodes)).toBe(7);
    expect(latest?.assumedDays).toEqual([
      requireDate('2026-12-02'),
      requireDate('2026-12-03'),
      requireDate('2026-12-04'),
      requireDate('2026-12-05'),
      requireDate('2026-12-06'),
      requireDate('2026-12-07'),
    ]);
    expect(latest?.end).toBe(requireDate('2026-12-01'));
  });
  it('uses only the latest six period episodes after chronological ordering', () => {
    const input = syntheticInput('2026-10-02');
    const episodes = [
      syntheticEpisode('2026-01-01', 100),
      syntheticEpisode('2026-02-01', 4),
      syntheticEpisode('2026-03-01', 4),
      syntheticEpisode('2026-04-01', 4),
      syntheticEpisode('2026-05-01', 7),
      syntheticEpisode('2026-06-01', 100),
      syntheticEpisode('2026-07-01', 100),
    ];
    expect(estimatePeriodLength(input, episodes.reverse())).toBe(6);
  });

  it('uses the typical length fallback when no natural period episodes exist', () => {
    const input = syntheticInput('2026-10-02', { typicalPeriodLength: 7 });
    expect(
      estimatePeriodLength(input, [
        syntheticEpisode('2026-01-01', 3, 'withdrawal'),
        syntheticEpisode('2026-02-01', 4, 'postpartum_lochia'),
      ]),
    ).toBe(7);
  });
});
