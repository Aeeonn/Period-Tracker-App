// synthetic: true - deterministic A11 boundary and edge cases only.
import { describe, expect, it } from 'vitest';
import type { DayLog, ContraceptionState } from '../../../src/contracts/entities.ts';
import type { EngineInput } from '../../../src/contracts/engine-api.ts';
import type { LocalDate } from '../../../src/contracts/localdate.ts';
import { runEngine } from '../../../src/engine/index.ts';
import { addDays, parse } from '../../../src/lib/localdate/index.ts';

type RawLog = Omit<DayLog, 'localDate'> & { readonly localDate: string };

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function startsFromLengths(start: string, lengths: readonly number[]): LocalDate[] {
  const starts = [date(start)];
  for (const length of lengths) starts.push(addDays(starts[starts.length - 1]!, length));
  return starts;
}

function createInput(
  today: string,
  starts: readonly LocalDate[] = [],
  periodDays: readonly number[] = [],
  options: {
    readonly lifeStage?: EngineInput['profile']['lifeStage'];
    readonly birthYear?: number;
    readonly contraception?: readonly ContraceptionState[];
    readonly extraLogs?: readonly RawLog[];
  } = {},
): EngineInput {
  const logs = new Map<LocalDate, DayLog>();
  for (const [index, start] of starts.entries()) {
    const count = periodDays[index] ?? 1;
    for (let offset = 0; offset < count; offset += 1) {
      const localDate = addDays(start, offset);
      logs.set(localDate, { localDate, flow: 'medium' });
    }
  }
  for (const raw of options.extraLogs ?? []) {
    const localDate = date(raw.localDate);
    logs.set(localDate, { ...logs.get(localDate), ...raw, localDate } as DayLog);
  }
  return {
    today: date(today),
    profile: {
      lifeStage: options.lifeStage ?? 'cycle',
      contraception: options.contraception ?? [],
      ...(options.birthYear === undefined ? {} : { birthYear: options.birthYear }),
    },
    dayLogs: [...logs.values()].sort((left, right) =>
      left.localDate.localeCompare(right.localDate),
    ),
    episodesOverride: [],
    pregnancies: [],
    coupleEntriesAllowedForInsights: [],
  };
}

function warnings(input: EngineInput) {
  return runEngine(input).warnings;
}

function warningFor(input: EngineInput, ruleId: string) {
  return warnings(input).find((warning) => warning.ruleId === ruleId);
}

describe('A11 warning rule boundaries', () => {
  it('W-03 uses the last six periods and escalates at two periods over seven days', () => {
    const starts = startsFromLengths('2026-01-01', [28, 28, 28, 28, 28]);
    const input = createInput(addDays(starts[5]!, 5), starts, [5, 5, 8, 5, 8, 5]);
    expect(warningFor(input, 'W-03')).toMatchObject({ severity: 'DISCUSS' });

    const sevenPeriods = startsFromLengths('2026-01-01', [28, 28, 28, 28, 28, 28]);
    const oldLongOnly = createInput(
      addDays(sevenPeriods[6]!, 5),
      sevenPeriods,
      [9, 5, 5, 5, 5, 5, 5],
    );
    expect(warningFor(oldLongOnly, 'W-03')).toBeUndefined();
  });

  it('W-01 requires soaking and a named symptom on the same day', () => {
    const input = createInput('2026-10-04', [date('2026-10-01')], [4], {
      extraLogs: [
        { localDate: '2026-10-01', heavy_detail: ['soaking_hourly_over_2h'] },
        { localDate: '2026-10-02', symptoms_body: ['dizziness'] },
      ],
    });
    expect(warningFor(input, 'W-01')).toBeUndefined();
    expect(warningFor(input, 'W-02')?.severity).toBe('DISCUSS');
  });

  it('W-01 fires on day D and D+1 only; an old log does not resurface', () => {
    const event: RawLog = {
      localDate: '2026-10-02',
      heavy_detail: ['soaking_hourly_over_2h'],
      symptoms_body: ['dizziness'],
    };
    const dayD = createInput('2026-10-02', [], [], { extraLogs: [event] });
    const dayD1 = createInput('2026-10-03', [], [], { extraLogs: [event] });
    const dayD2 = createInput('2026-10-04', [], [], { extraLogs: [event] });
    const oldOnly = createInput('2026-10-15', [], [], {
      extraLogs: [
        {
          localDate: '2025-03-04',
          heavy_detail: ['soaking_hourly_over_2h'],
          symptoms_body: ['dizziness'],
        },
      ],
    });

    expect(warningFor(dayD, 'W-01')).toMatchObject({
      severity: 'EMERGENCY',
      dismissible: false,
      evidenceDates: [date('2026-10-02')],
    });
    expect(warningFor(dayD1, 'W-01')).toMatchObject({
      severity: 'EMERGENCY',
      dismissible: false,
      evidenceDates: [date('2026-10-02')],
    });
    expect(warningFor(dayD2, 'W-01')).toBeUndefined();
    expect(warnings(oldOnly)).toEqual([]);
  });

  it('W-02 seeks advice when two distinct items occur on one current-episode day', () => {
    const input = createInput('2026-10-01', [date('2026-10-01')], [1], {
      extraLogs: [{ localDate: '2026-10-01', heavy_detail: ['clots_over_2_5cm', 'flooding'] }],
    });
    expect(warningFor(input, 'W-02')?.severity).toBe('SEEK_ADVICE_SOON');
  });

  it('W-04 accepts the 21 and 35 day boundaries and escalates two outside cycles', () => {
    const boundaryStarts = startsFromLengths('2026-06-01', [21, 35]);
    const boundary = createInput(boundaryStarts[2]!, boundaryStarts, [1, 1, 1]);
    expect(warningFor(boundary, 'W-04')).toBeUndefined();

    const outsideStarts = startsFromLengths('2026-06-01', [20, 36]);
    const outside = createInput(outsideStarts[2]!, outsideStarts, [1, 1, 1]);
    expect(warningFor(outside, 'W-04')?.severity).toBe('DISCUSS');
  });

  it('W-05 applies the distinct unknown and 26-41 thresholds', () => {
    const starts = startsFromLengths('2026-02-01', [28, 36]);
    const unknownAge = createInput(starts[2]!, starts, [1, 1, 1]);
    const age30 = createInput(starts[2]!, starts, [1, 1, 1], { birthYear: 1996 });
    expect(warningFor(unknownAge, 'W-05')).toBeUndefined();
    expect(warningFor(age30, 'W-05')?.severity).toBe('INFO');
  });

  it('W-06 suppresses pregnancy, postpartum, and active continuous hormonal states', () => {
    const today = '2026-08-31';
    const starts = [date('2026-06-01')];
    const pregnant = createInput(today, starts, [1], { lifeStage: 'pregnancy' });
    const postpartum = createInput(today, starts, [1], { lifeStage: 'postpartum' });
    const continuousMethod: ContraceptionState = {
      method: 'combined_pill',
      startDate: date('2026-01-01'),
      regimen: { activeDays: 21, breakDays: 0, continuous: true },
    };
    const continuous = createInput(today, starts, [1], { contraception: [continuousMethod] });
    expect(warningFor(pregnant, 'W-06')).toBeUndefined();
    expect(warningFor(postpartum, 'W-06')).toBeUndefined();
    expect(warningFor(continuous, 'W-06')).toBeUndefined();
  });

  it('W-07 excludes spotting attached by A1 and exits the method window at its calendar-month boundary', () => {
    const attached = createInput('2026-10-07', [date('2026-10-01')], [5], {
      extraLogs: [{ localDate: '2026-10-07', flow: 'spotting' }],
    });
    expect(warningFor(attached, 'W-07')).toBeUndefined();

    const starts = [date('2026-08-01'), date('2026-08-29'), date('2026-09-26'), date('2026-10-24')];
    const method: ContraceptionState = {
      method: 'combined_pill',
      startDate: date('2026-08-02'),
      regimen: { activeDays: 21, breakDays: 7, continuous: false },
    };
    const boundary = createInput('2026-11-02', starts, [1, 1, 1, 1], {
      contraception: [method],
      extraLogs: [
        { localDate: '2026-08-14', flow: 'spotting' },
        { localDate: '2026-11-02', flow: 'spotting' },
      ],
    });
    expect(warningFor(boundary, 'W-07')?.severity).toBe('INFO');
  });

  it('W-07 counts the method anniversary as outside the window, but not the day before', () => {
    const starts = startsFromLengths('2026-07-01', [28, 28, 28, 28]);
    const method: ContraceptionState = {
      method: 'combined_pill',
      startDate: date('2026-08-02'),
      regimen: { activeDays: 21, breakDays: 7, continuous: false },
    };
    const preStartSpotting: RawLog = { localDate: '2026-07-15', flow: 'spotting' };
    const anniversary = createInput('2026-11-02', starts, [1, 1, 1, 1, 1], {
      contraception: [method],
      extraLogs: [preStartSpotting, { localDate: '2026-11-02', flow: 'spotting' }],
    });
    const dayBeforeAnniversary = createInput('2026-11-01', starts, [1, 1, 1, 1, 1], {
      contraception: [method],
      extraLogs: [preStartSpotting, { localDate: '2026-11-01', flow: 'spotting' }],
    });

    expect(warningFor(anniversary, 'W-07')?.severity).toBe('DISCUSS');
    expect(warningFor(dayBeforeAnniversary, 'W-07')?.severity).toBe('INFO');
  });

  it('W-11 remains non-dismissible through yesterday and expires after that', () => {
    const logs: RawLog[] = [{ localDate: '2026-10-02', mood: ['thoughts_of_self_harm'] }];
    const today = createInput('2026-10-02', [], [], { extraLogs: logs });
    const tomorrow = createInput('2026-10-03', [], [], { extraLogs: logs });
    const later = createInput('2026-10-04', [], [], { extraLogs: logs });
    expect(warningFor(today, 'W-11')?.dismissible).toBe(false);
    expect(warningFor(tomorrow, 'W-11')?.dismissible).toBe(false);
    expect(warningFor(later, 'W-11')).toBeUndefined();
  });
});
