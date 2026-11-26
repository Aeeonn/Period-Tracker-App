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
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  readonly role: Role;
  readonly cycleLength?: number;
  readonly periodLength?: number;
  readonly contraception: Contraception;
  readonly theme: Theme;
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

/** Shape of an export file. */
export interface ExportFile {
  readonly app: 'flo-lite';
  readonly version: 1;
  readonly exportedOn: LocalDate;
  readonly settings: Settings;
  readonly days: readonly DayLog[];
}
