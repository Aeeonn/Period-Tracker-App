import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFY,
  DEFAULT_SETTINGS,
  type DayLog,
  type NotifyPrefs,
  type Settings,
} from '../src/data/types.ts';
import { runEngine } from '../src/engine/index.ts';
import { addDays, date, type LocalDate } from '../src/lib/date.ts';
import { addYears, DISCREET, HORIZON_DAYS, planReminders } from '../src/notify/plan.ts';
import { firstReminderDay, instantOf, MAX_TIMES, sendTimes } from '../src/notify/schedule.ts';
import type { Snapshot } from '../src/share/snapshot.ts';

const ON: NotifyPrefs = { ...DEFAULT_NOTIFY, enabled: true, since: date('2026-03-01') };

function period(start: string, length = 5): DayLog[] {
  return Array.from({ length }, (_, i) => ({ date: addDays(date(start), i), flow: 'medium' }));
}

function owner(
  today: string,
  days: DayLog[],
  options: { prefs?: Partial<NotifyPrefs>; settings?: Partial<Settings>; from?: string } = {},
) {
  const settings: Settings = { ...DEFAULT_SETTINGS, cycleLength: 28, ...options.settings };
  const output = runEngine({
    today: date(today),
    days,
    contraception: settings.contraception,
    ...(settings.cycleLength ? { cycleLength: settings.cycleLength } : {}),
  });
  return planReminders({
    role: 'owner',
    from: date(options.from ?? today),
    today: date(today),
    prefs: { ...ON, ...options.prefs },
    settings,
    days,
    output,
  });
}

const kinds = (plan: ReturnType<typeof planReminders>, kind: string) =>
  plan.filter((item) => item.reminder === kind).map((item) => item.date);

describe('planReminders (her phone)', () => {
  // Periods on Jan 1, Jan 29, Feb 26: the next is predicted for Mar 26.
  const regular = [...period('2026-01-01'), ...period('2026-01-29'), ...period('2026-02-26')];

  it('warns before the predicted period and asks afterwards whether it started', () => {
    const plan = owner('2026-03-10', regular);
    expect(kinds(plan, 'period_soon')).toEqual(['2026-03-23']);
    expect(plan.find((i) => i.reminder === 'period_soon')?.body).toBe(
      'Your period may start in about 3 days, around Mar 26.',
    );
    expect(kinds(plan, 'period_check')).toEqual(['2026-03-28']);
  });

  it('follows the chosen number of days before', () => {
    const plan = owner('2026-03-10', regular, { prefs: { daysBefore: 1 } });
    expect(plan.find((i) => i.reminder === 'period_soon')).toMatchObject({
      date: '2026-03-25',
      body: 'Your period may start in about 1 day, around Mar 26.',
    });
  });

  it('plans a daily log reminder but skips today once today is logged', () => {
    const logged = [...regular, { date: date('2026-03-10'), energy: 'high' as const }];
    expect(kinds(owner('2026-03-10', regular), 'daily_log')[0]).toBe('2026-03-10');
    const daily = kinds(owner('2026-03-10', logged), 'daily_log');
    expect(daily[0]).toBe('2026-03-11');
    expect(daily).toHaveLength(HORIZON_DAYS - 1);
  });

  it('starts at the given first day', () => {
    const plan = owner('2026-03-10', regular, { from: '2026-03-11' });
    expect(plan.every((item) => item.date >= '2026-03-11')).toBe(true);
  });

  it('asks whether the period is over when only the first day was logged', () => {
    const days = [...regular, { date: date('2026-03-26'), flow: 'heavy' as const }];
    expect(kinds(owner('2026-03-27', days), 'period_end')).toEqual(['2026-03-31']);
    // A later flow entry (including "None") means she is already logging it.
    const more = [...days, { date: date('2026-03-28'), flow: 'none' as const }];
    expect(kinds(owner('2026-03-28', more), 'period_end')).toEqual([]);
  });

  it('never predicts a period on a hormonal IUD with too few periods', () => {
    const plan = owner('2026-03-10', period('2026-02-26'), {
      settings: { contraception: 'hormonal_iud' },
    });
    expect(kinds(plan, 'period_soon')).toEqual([]);
    expect(kinds(plan, 'period_check')).toEqual([]);
    expect(plan.some((i) => /fertil|ovulat/i.test(i.title + i.body))).toBe(false);
  });

  it('reminds 90 and 30 days before the IUD is due', () => {
    const settings = {
      contraception: 'hormonal_iud' as const,
      iudInsertedOn: date('2021-07-01'),
      iudYears: 5,
    };
    const plan = owner('2026-03-10', [], { settings });
    expect(kinds(plan, 'iud')).toEqual(['2026-04-02', '2026-06-01']);
    expect(plan.find((i) => i.reminder === 'iud')?.body).toContain('July 2026');
    // No reminder without an IUD, even if dates are left over.
    expect(
      kinds(owner('2026-03-10', [], { settings: { ...settings, contraception: 'none' } }), 'iud'),
    ).toEqual([]);
  });

  it('handles 29 February insertion dates', () => {
    expect(addYears(date('2024-02-29'), 5)).toBe('2029-02-28');
    expect(addYears(date('2024-02-29'), 8)).toBe('2032-02-29');
  });

  it('reminds to back up 30 days after the last export, then weekly', () => {
    expect(
      kinds(owner('2026-03-10', [], { prefs: { lastExportOn: date('2026-03-05') } }), 'backup'),
    ).toEqual(['2026-04-04']);
    // Overdue: the next weekly repeat on or after today.
    expect(
      kinds(owner('2026-03-10', [], { prefs: { lastExportOn: date('2026-01-01') } }), 'backup'),
    ).toEqual(['2026-03-14']);
    expect(
      kinds(owner('2026-03-10', [], { prefs: { lastExportOn: date('2026-01-29') } }), 'backup'),
    ).toEqual(['2026-03-14']);
  });

  it('leaves out switched-off reminders and the day already shown', () => {
    const plan = owner('2026-03-10', regular, {
      prefs: { off: ['daily_log', 'backup'], lastShownOn: date('2026-03-23') },
    });
    expect(kinds(plan, 'daily_log')).toEqual([]);
    expect(kinds(plan, 'backup')).toEqual([]);
    expect(kinds(plan, 'period_soon')).toEqual([]);
    expect(kinds(plan, 'period_check')).toEqual(['2026-03-28']);
  });

  it('uses neutral wording when discreet', () => {
    const plan = owner('2026-03-10', regular, { prefs: { discreet: true } });
    expect(plan.length).toBeGreaterThan(0);
    for (const item of plan)
      expect([item.title, item.body]).toEqual([DISCREET.title, DISCREET.body]);
  });

  it('sorts by day and is deterministic', () => {
    const a = owner('2026-03-10', regular);
    expect(owner('2026-03-10', regular)).toEqual(a);
    const sameDay = a.filter((i) => i.date === '2026-03-23').map((i) => i.reminder);
    expect(sameDay).toEqual(['period_soon', 'daily_log']);
  });
});

describe('planReminders (his phone)', () => {
  const snapshot = (prediction?: { center: string }, paused = false): Snapshot => ({
    v: 1,
    createdAt: 0,
    madeOn: date('2026-03-10'),
    paused,
    categories: prediction ? ['period'] : [],
    days: [],
    ...(prediction
      ? {
          period: {
            periodDays: [],
            basis: '',
            prediction: {
              center: date(prediction.center),
              lo: addDays(date(prediction.center), -2),
              hi: addDays(date(prediction.center), 2),
            },
          },
        }
      : {}),
  });
  const partner = (snap: Snapshot | undefined, today = '2026-03-10') =>
    planReminders({
      role: 'partner',
      from: date(today),
      today: date(today),
      prefs: ON,
      snapshot: snap,
    });

  it('gives a heads-up before her predicted period', () => {
    expect(partner(snapshot({ center: '2026-03-26' }))).toEqual([
      {
        date: '2026-03-23',
        reminder: 'partner_period_soon',
        title: 'Heads-up',
        body: 'Her period may start in about 3 days, around Mar 26.',
        url: '#/partner',
      },
    ]);
  });

  it('says nothing without a shared prediction, when paused, or once the day has passed', () => {
    expect(partner(undefined)).toEqual([]);
    expect(partner(snapshot())).toEqual([]);
    expect(partner(snapshot({ center: '2026-03-26' }, true))).toEqual([]);
    expect(partner(snapshot({ center: '2026-03-26' }), '2026-03-24')).toEqual([]);
  });
});

describe('send times', () => {
  const plan = (dates: string[]) =>
    dates.map((d) => ({
      date: d as LocalDate,
      reminder: 'daily_log' as const,
      title: '',
      body: '',
      url: '',
    }));

  it('uses the chosen local time and starts tomorrow once it has passed', () => {
    const today = date('2026-03-10');
    const tomorrow = date('2026-03-11');
    const at = instantOf(today, '21:00');
    expect(new Date(at).getHours()).toBe(21);
    expect(firstReminderDay(today, tomorrow, '21:00', at - 1)).toBe(today);
    expect(firstReminderDay(today, tomorrow, '21:00', at)).toBe(tomorrow);
  });

  it('keeps unique future times, soonest first, up to the cap', () => {
    const now = instantOf(date('2026-03-10'), '12:00');
    const times = sendTimes(
      plan(['2026-03-11', '2026-03-09', '2026-03-11', '2026-03-10']),
      '21:00',
      now,
    );
    expect(times).toEqual([
      instantOf(date('2026-03-10'), '21:00'),
      instantOf(date('2026-03-11'), '21:00'),
    ]);
    const many = plan(Array.from({ length: 80 }, (_, i) => addDays(date('2026-03-11'), i)));
    expect(sendTimes(many, '21:00', now)).toHaveLength(MAX_TIMES);
  });
});
