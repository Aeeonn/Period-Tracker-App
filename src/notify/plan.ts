import {
  isIud,
  type DayLog,
  type NotifyPrefs,
  type Reminder,
  type Settings,
} from '../data/types.ts';
import type { EngineOutput } from '../engine/index.ts';
import { addDays, compare, diffDays, parse, shortLabel, type LocalDate } from '../lib/date.ts';
import type { Snapshot } from '../share/snapshot.ts';

/** Daily reminders are planned this many days ahead; the plan is refreshed on every change and every push. */
export const HORIZON_DAYS = 35;

/** A reminder on a calendar day; every reminder goes out at the chosen time of day. */
export interface Planned {
  readonly date: LocalDate;
  readonly reminder: Reminder;
  readonly title: string;
  readonly body: string;
  /** In-app route to open when tapped. */
  readonly url: string;
}

interface Common {
  /** First day a reminder may fall on (today, or tomorrow once today's time has passed). */
  readonly from: LocalDate;
  readonly today: LocalDate;
  readonly prefs: NotifyPrefs;
}

export interface OwnerPlanInput extends Common {
  readonly role: 'owner';
  readonly settings: Settings;
  readonly days: readonly DayLog[];
  readonly output: EngineOutput;
}

export interface PartnerPlanInput extends Common {
  readonly role: 'partner';
  readonly snapshot: Snapshot | undefined;
}

export type PlanInput = OwnerPlanInput | PartnerPlanInput;

const ORDER: readonly Reminder[] = [
  'period_soon',
  'partner_period_soon',
  'period_check',
  'period_end',
  'iud',
  'backup',
  'daily_log',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthLabel(date: LocalDate): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

function days(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

/** Same month and day `years` later; 29 February becomes 28 February in a common year. */
export function addYears(date: LocalDate, years: number): LocalDate {
  const year = String(Number(date.slice(0, 4)) + years).padStart(4, '0');
  return parse(`${year}${date.slice(4)}`) ?? (`${year}-02-28` as LocalDate);
}

/** Wording shown on the lock screen when "Discreet wording" is on. */
export const DISCREET = { title: 'Flo', body: 'You have a reminder.' } as const;

function ownerPlan(input: OwnerPlanInput): Planned[] {
  const { from, today, prefs, settings, output } = input;
  const items: Planned[] = [];
  const add = (date: LocalDate, reminder: Reminder, title: string, body: string, url: string) => {
    if (compare(date, from) >= 0) items.push({ date, reminder, title, body, url });
  };
  const prediction = output.prediction;

  if (prediction.kind === 'prediction' && prediction.state === 'upcoming') {
    const n = prefs.daysBefore;
    add(
      addDays(prediction.center, -n),
      'period_soon',
      'Period coming up',
      `Your period may start in about ${days(n)}, around ${shortLabel(prediction.center)}.`,
      '#/today',
    );
  }

  if (prediction.kind === 'prediction') {
    add(
      addDays(prediction.center, 2),
      'period_check',
      'Did your period start?',
      'If it did, log the first day so your predictions stay accurate.',
      '#/log',
    );
  }

  // Only the first day was logged: after her usual length, ask whether it has ended.
  const latest = output.episodes.at(-1);
  if (latest !== undefined && latest.bleedingDays === 1) {
    const usual =
      prediction.kind === 'prediction' ? prediction.periodLength : (settings.periodLength ?? 5);
    const loggedSince = input.days.some(
      (day) => compare(day.date, latest.start) > 0 && day.flow !== undefined,
    );
    if (!loggedSince && diffDays(latest.start, today) <= usual + 1) {
      add(
        addDays(latest.start, Math.max(1, usual)),
        'period_end',
        'Is your period over?',
        'Log today’s flow, or “None” if it has stopped, so your period length stays accurate.',
        '#/log',
      );
    }
  }

  if (isIud(settings.contraception) && settings.iudInsertedOn && settings.iudYears) {
    const due = addYears(settings.iudInsertedOn, settings.iudYears);
    for (const before of [90, 30]) {
      add(
        addDays(due, -before),
        'iud',
        'IUD replacement',
        `Your IUD is due to be replaced around ${monthLabel(due)}. You may want to book an appointment.`,
        '#/settings',
      );
    }
  }

  // 30 days after the last export (or since reminders were turned on), then weekly until she makes one.
  const firstBackup = addDays(prefs.lastExportOn ?? prefs.since ?? today, 30);
  const late = diffDays(firstBackup, from);
  add(
    late <= 0 ? firstBackup : addDays(firstBackup, Math.ceil(late / 7) * 7),
    'backup',
    'Time for a backup',
    'Your Flo data lives only on this phone. Export a copy in Settings.',
    '#/settings',
  );

  const loggedToday = input.days.some((day) => day.date === today);
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const date = addDays(from, offset);
    if (date === today && loggedToday) continue;
    add(
      date,
      'daily_log',
      'How was today?',
      'Log your day in a few taps. Skip anything you like.',
      '#/log',
    );
  }
  return items;
}

function partnerPlan(input: PartnerPlanInput): Planned[] {
  const prediction = input.snapshot?.paused ? undefined : input.snapshot?.period?.prediction;
  if (prediction === undefined || compare(prediction.center, input.today) <= 0) return [];
  const n = input.prefs.daysBefore;
  const date = addDays(prediction.center, -n);
  if (compare(date, input.from) < 0) return [];
  return [
    {
      date,
      reminder: 'partner_period_soon',
      title: 'Heads-up',
      body: `Her period may start in about ${days(n)}, around ${shortLabel(prediction.center)}.`,
      url: '#/partner',
    },
  ];
}

/**
 * Every reminder due from `from` onwards, sorted by day. Pure: the same input
 * always gives the same plan. Reminders switched off, and any on a day a
 * reminder was already shown, are left out.
 */
export function planReminders(input: PlanInput): Planned[] {
  const items = input.role === 'owner' ? ownerPlan(input) : partnerPlan(input);
  return items
    .filter(
      (item) => !input.prefs.off.includes(item.reminder) && item.date !== input.prefs.lastShownOn,
    )
    .map((item) => (input.prefs.discreet ? { ...item, ...DISCREET } : item))
    .sort(
      (a, b) => compare(a.date, b.date) || ORDER.indexOf(a.reminder) - ORDER.indexOf(b.reminder),
    );
}
