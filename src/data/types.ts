import type { LocalDate } from '../lib/date.ts';
import type { Snapshot } from '../share/snapshot.ts';

export const FLOW = ['none', 'spotting', 'light', 'medium', 'heavy', 'very_heavy'] as const;
export type Flow = (typeof FLOW)[number];

export const PAIN = ['none', 'mild', 'moderate', 'severe'] as const;
export type Pain = (typeof PAIN)[number];

export const DISCHARGE = [
  'none',
  'dry',
  'sticky',
  'creamy',
  'watery',
  'egg_white',
  'brown',
  'unusual',
] as const;
export type Discharge = (typeof DISCHARGE)[number];

export const SYMPTOMS = [
  'cramps',
  'headache',
  'back_pain',
  'pelvic_pain',
  'breast_tenderness',
  'bloating',
  'nausea',
  'acne',
  'fatigue',
  'cravings',
  'insomnia',
  'vaginal_dryness',
  'dizziness',
  'breathlessness',
  'chest_pain',
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const MOODS = [
  'happy',
  'calm',
  'loving',
  'playful',
  'confident',
  'irritable',
  'anxious',
  'sad',
  'low',
  'mood_swings',
] as const;
export type Mood = (typeof MOODS)[number];

export const LEVEL = ['low', 'medium', 'high'] as const;
export type Level = (typeof LEVEL)[number];

export const DESIRE = ['none', 'low', 'medium', 'high'] as const;
export type Desire = (typeof DESIRE)[number];

export const COMFORT = ['painful', 'uncomfortable', 'okay', 'comfortable'] as const;
export type Comfort = (typeof COMFORT)[number];

export const SATISFACTION = ['low', 'okay', 'high'] as const;
export type Satisfaction = (typeof SATISFACTION)[number];

export const SLEEP_QUALITY = ['poor', 'okay', 'good'] as const;
export type SleepQuality = (typeof SLEEP_QUALITY)[number];

export interface SexLog {
  readonly comfort?: Comfort;
  readonly satisfaction?: Satisfaction;
}

/**
 * One day of logs. A missing field was not logged; it never means "none".
 * `soaking` is "soaking a pad or tampon every hour for 2+ hours".
 */
export interface DayLog {
  readonly date: LocalDate;
  readonly flow?: Flow;
  readonly soaking?: boolean;
  readonly pain?: Pain;
  readonly discharge?: Discharge;
  readonly symptoms?: readonly Symptom[];
  readonly energy?: Level;
  readonly mood?: readonly Mood[];
  readonly desire?: Desire;
  readonly sex?: SexLog;
  readonly sleepHours?: number;
  readonly sleepQuality?: SleepQuality;
  readonly activityMinutes?: number;
  /** Drinks. */
  readonly alcohol?: number;
  /** Glasses. */
  readonly water?: number;
  /** Private; never shared. */
  readonly notes?: string;
}

export const CONTRACEPTION = [
  'none',
  'hormonal_iud',
  'copper_iud',
  'other_hormonal',
  'other',
] as const;
export type Contraception = (typeof CONTRACEPTION)[number];

export function isHormonal(method: Contraception): boolean {
  return method === 'hormonal_iud' || method === 'other_hormonal';
}

export type Role = 'owner' | 'partner';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export function isIud(method: Contraception): boolean {
  return method === 'hormonal_iud' || method === 'copper_iud';
}

/** How long an IUD lasts varies by brand; she picks what her clinic told her. */
export const IUD_YEARS = [3, 5, 8, 10, 12] as const;

export interface Settings {
  readonly role: Role;
  readonly cycleLength?: number;
  readonly periodLength?: number;
  readonly contraception: Contraception;
  readonly theme: Theme;
  /** Only used for the IUD replacement reminder. */
  readonly iudInsertedOn?: LocalDate;
  readonly iudYears?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  role: 'owner',
  contraception: 'none',
  theme: 'system',
};

export const SHARE_CATEGORIES = [
  'period',
  'fertility',
  'body',
  'mood',
  'desire',
  'sex',
  'habits',
] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

/** Her side of sharing. `writeKey` never leaves her phone except as a bearer token to the relay. */
export interface OwnerShare {
  readonly role: 'owner';
  readonly coupleId: string;
  readonly readKey: string;
  readonly writeKey: string;
  readonly categories: readonly ShareCategory[];
  readonly paused: boolean;
  /** True when the latest change has not reached the relay yet. */
  readonly pendingUpload: boolean;
  readonly lastUploadedAt?: number;
}

/** His side: read access only, plus the last snapshot for offline viewing. */
export interface PartnerShare {
  readonly role: 'partner';
  readonly coupleId: string;
  readonly readKey: string;
  readonly lastSnapshot?: Snapshot;
  readonly lastFetchedAt?: number;
  readonly ended?: boolean;
}

export type ShareState = OwnerShare | PartnerShare;

export const OWNER_REMINDERS = [
  'daily_log',
  'period_soon',
  'period_check',
  'period_end',
  'backup',
  'iud',
] as const;
export const PARTNER_REMINDERS = ['partner_period_soon', 'partner_period_started'] as const;
export type Reminder = (typeof OWNER_REMINDERS)[number] | (typeof PARTNER_REMINDERS)[number];

/** Notification choices for this phone. Kept apart from Settings so an import never changes them. */
export interface NotifyPrefs {
  readonly enabled: boolean;
  /** Local time of day for every reminder, "HH:MM". */
  readonly time: string;
  /** "Period coming up" goes this many days before the expected start. */
  readonly daysBefore: number;
  /** Generic wording on the lock screen. */
  readonly discreet: boolean;
  readonly off: readonly Reminder[];
  /** Her choice: tell his phone when she logs the first day of a period. */
  readonly tellPartner: boolean;
  /** The day notifications were first turned on; the first backup reminder counts from here. */
  readonly since?: LocalDate;
  readonly lastExportOn?: LocalDate;
  readonly lastAnnouncedStart?: LocalDate;
  /** The last day a scheduled reminder was shown, so one day never gets two. */
  readonly lastShownOn?: LocalDate;
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  enabled: false,
  time: '21:00',
  daysBefore: 3,
  discreet: false,
  off: [],
  tellPartner: false,
};

/** This phone's registration with the relay for push. `secret` never leaves the phone except as a bearer token. */
export interface PushDevice {
  readonly id: string;
  readonly secret: string;
  readonly endpoint: string;
  /** The relay's public VAPID key the subscription was made with. */
  readonly serverKey: string;
  /** What was last sent to the relay, so unchanged schedules aren't re-sent. */
  readonly sentKey?: string;
}

/** Shape of an export file. */
export interface ExportFile {
  readonly app: 'flo-lite';
  readonly version: 1;
  readonly exportedOn: LocalDate;
  readonly settings: Settings;
  readonly days: readonly DayLog[];
}
