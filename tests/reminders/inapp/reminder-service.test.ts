// synthetic: true - in-app reminder fixtures use only synthetic dates and records.
import { describe, expect, it } from 'vitest';
import type { ReminderId } from '../../../src/contracts/brand.ts';
import { ENGINE_VERSION } from '../../../src/contracts/engine-api.ts';
import type { EngineOutput, Episode } from '../../../src/contracts/engine-api.ts';
import type { ReminderContext } from '../../../src/contracts/reminders.ts';
import type { ReminderRule } from '../../../src/contracts/entities.ts';
import type { LocalDate, LocalTime } from '../../../src/contracts/localdate.ts';
import { addDays, parse } from '../../../src/lib/localdate/index.ts';
import { evaluateReminders } from '../../../src/reminders/inapp/index.ts';

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function time(value: string): LocalTime {
  return value as LocalTime;
}

const TODAY = date('2024-02-28');
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function rule(overrides: Partial<ReminderRule> = {}): ReminderRule {
  return {
    id: 'synthetic-reminder-rule' as ReminderId,
    kind: 'still_bleeding',
    localTime: time('18:00'),
    days: ALL_DAYS,
    condition: 'during_bleeding',
    enabled: true,
    ...overrides,
  };
}

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    start: TODAY,
    end: TODAY,
    bleedingDays: 1,
    spottingDays: [],
    assumedDays: [],
    kind: 'period',
    flags: [],
    ...overrides,
  };
}

function prediction(center: LocalDate = date('2024-03-01')): EngineOutput['prediction'] {
  return {
    kind: 'prediction',
    center,
    lo: addDays(center, -2),
    hi: addDays(center, 2),
    state: 'upcoming',
    cyclesUsed: 1,
    halfWidth: 2,
    expectedPeriodLength: 5,
  };
}

function engineOutput(overrides: Partial<EngineOutput> = {}): EngineOutput {
  return {
    engineVersion: ENGINE_VERSION,
    paramsHash: 'synthetic-reminders-v1',
    episodes: [],
    cycles: [],
    prediction: { kind: 'suppressed', reason: 'no_data' },
    fertility: { kind: 'suppressed', reason: 'no_data' },
    chanceByDay: {},
    warnings: [],
    tendencies: [],
    explanations: [],
    ...overrides,
  };
}

function context(overrides: Partial<ReminderContext> = {}): ReminderContext {
  return {
    today: TODAY,
    now: time('18:00'),
    rules: [],
    engineOutput: engineOutput(),
    recentDayLogs: [],
    ...overrides,
  };
}

describe('T-REM-01 in-app reminder evaluation', () => {
  it('shows the still-bleeding prompt for an open episode at the configured time', () => {
    const reminder = rule();
    const result = evaluateReminders(
      context({ rules: [reminder], engineOutput: engineOutput({ episodes: [episode()] }) }),
    );

    expect(result).toEqual([{ ruleId: reminder.id, kind: 'still_bleeding' }]);
  });

  it('treats the configured time as inclusive and does not fire early', () => {
    const reminder = rule();
    const output = engineOutput({ episodes: [episode()] });

    expect(evaluateReminders(context({ rules: [reminder], engineOutput: output }))).toHaveLength(1);
    expect(
      evaluateReminders(context({ rules: [reminder], now: time('17:59'), engineOutput: output })),
    ).toEqual([]);
  });

  it('requires a selected weekday and an enabled rule', () => {
    const output = engineOutput({ episodes: [episode()] });

    expect(
      evaluateReminders(context({ rules: [rule({ days: [3] })], engineOutput: output })),
    ).toHaveLength(1);
    expect(
      evaluateReminders(context({ rules: [rule({ days: [2] })], engineOutput: output })),
    ).toEqual([]);
    expect(
      evaluateReminders(context({ rules: [rule({ days: [] })], engineOutput: output })),
    ).toEqual([]);
    expect(
      evaluateReminders(context({ rules: [rule({ enabled: false })], engineOutput: output })),
    ).toEqual([]);
  });

  it('does not show still-bleeding without an episode covering today', () => {
    expect(evaluateReminders(context({ rules: [rule()] }))).toEqual([]);
    expect(
      evaluateReminders(
        context({
          rules: [rule()],
          engineOutput: engineOutput({
            episodes: [episode({ start: date('2024-02-26'), end: date('2024-02-27') })],
          }),
        }),
      ),
    ).toEqual([]);
  });

  it('recognizes an assumed episode day as open', () => {
    const reminder = rule();
    const result = evaluateReminders(
      context({
        rules: [reminder],
        engineOutput: engineOutput({
          episodes: [
            episode({ start: date('2024-02-27'), end: date('2024-02-27'), assumedDays: [TODAY] }),
          ],
        }),
      }),
    );

    expect(result).toEqual([{ ruleId: reminder.id, kind: 'still_bleeding' }]);
  });

  it('prompts for symptoms only when no symptom field was logged today', () => {
    const reminder = rule({ kind: 'daily_symptom_log', condition: 'always' });
    const base = context({ rules: [reminder] });

    expect(evaluateReminders(base)).toEqual([{ ruleId: reminder.id, kind: 'daily_symptom_log' }]);
    expect(
      evaluateReminders({
        ...base,
        recentDayLogs: [{ localDate: TODAY, symptoms_body: [] }],
      }),
    ).toEqual([]);
  });

  it('fires the period-window prompt exactly two LocalDates before the prediction center', () => {
    const reminder = rule({ kind: 'period_start_window', condition: 'near_predicted_start' });
    const result = evaluateReminders(
      context({
        rules: [reminder],
        engineOutput: engineOutput({
          prediction: prediction(),
          episodes: [episode({ start: date('2024-01-01'), end: date('2024-01-05') })],
        }),
      }),
    );

    expect(result).toEqual([{ ruleId: reminder.id, kind: 'period_start_window' }]);
  });

  it('does not fire without a prediction or a recorded period', () => {
    const reminder = rule({ kind: 'period_start_window', condition: 'near_predicted_start' });

    expect(evaluateReminders(context({ rules: [reminder] }))).toEqual([]);
    expect(
      evaluateReminders(
        context({
          rules: [reminder],
          engineOutput: engineOutput({ prediction: prediction() }),
        }),
      ),
    ).toEqual([]);
  });

  it('suppresses the period-window prompt if bleeding has already started', () => {
    const reminder = rule({ kind: 'period_start_window', condition: 'near_predicted_start' });
    const result = evaluateReminders(
      context({
        rules: [reminder],
        engineOutput: engineOutput({
          prediction: prediction(),
          episodes: [episode()],
        }),
      }),
    );

    expect(result).toEqual([]);
  });

  it('does not catch up after the target date, even within the prediction range', () => {
    const reminder = rule({ kind: 'period_start_window', condition: 'near_predicted_start' });

    expect(
      evaluateReminders(
        context({
          today: date('2024-02-29'),
          rules: [reminder],
          engineOutput: engineOutput({
            prediction: prediction(),
            episodes: [episode({ start: date('2024-01-01'), end: date('2024-01-05') })],
          }),
        }),
      ),
    ).toEqual([]);
  });

  it('allows custom reminders on their schedule and applies conditional custom rules', () => {
    const always = rule({ kind: 'custom', condition: 'always' });
    const conditional = rule({
      id: 'synthetic-custom-condition' as ReminderId,
      kind: 'custom',
      condition: 'during_bleeding',
    });

    expect(evaluateReminders(context({ rules: [always, conditional] }))).toEqual([
      { ruleId: always.id, kind: 'custom' },
    ]);
    expect(
      evaluateReminders(
        context({
          rules: [always, conditional],
          engineOutput: engineOutput({ episodes: [episode()] }),
        }),
      ),
    ).toEqual([
      { ruleId: always.id, kind: 'custom' },
      { ruleId: conditional.id, kind: 'custom' },
    ]);
  });

  it('does not evaluate pill reminders in this P1 in-app service', () => {
    const reminder = rule({ kind: 'pill', condition: 'pill_schedule' });
    expect(evaluateReminders(context({ rules: [reminder] }))).toEqual([]);
  });
});
