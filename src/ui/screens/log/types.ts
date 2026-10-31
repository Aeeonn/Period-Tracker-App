import type { createLogRepo } from '../../../data/repos/index.ts';
import type { Tracker, TrackerValues } from '../../../contracts/index.ts';

export type LogRepo = ReturnType<typeof createLogRepo>;

export type LogEntry = {
  readonly [K in Tracker]: { readonly tracker: K; readonly value: TrackerValues[K] };
}[Tracker];

export const DEFAULT_PINNED_TRACKERS: readonly Tracker[] = [
  'flow',
  'symptoms_body',
  'mood',
  'desire',
  'sex',
  'discharge',
  'energy',
  'notes',
  'tests',
];

export const TRACKER_LABELS: Readonly<Record<Tracker, string>> = {
  flow: 'Flow',
  heavy_detail: 'Heavy-flow details',
  period_pain: 'Period pain',
  discharge: 'Discharge',
  symptoms_body: 'Symptoms',
  mood: 'Mood',
  energy: 'Energy',
  stress: 'Stress',
  desire: 'Desire',
  sex: 'Sex and intimacy',
  tests: 'Tests and emergency contraception',
  bbt: 'Basal body temperature',
  ovulation_manual: 'Ovulation',
  pill_intake: 'Pill intake',
  medication: 'Medication',
  weight: 'Weight',
  water: 'Water',
  sleep: 'Sleep',
  activity: 'Activity',
  alcohol: 'Alcohol',
  notes: 'Notes',
  peri_impact: 'Perimenopause impacts',
  lochia: 'Postpartum bleeding',
};

const SPECIAL_LABELS: Readonly<Record<string, string>> = {
  none: 'None',
  very_heavy: 'Very heavy',
  change_every_1_2h: 'Change every 1-2 hours',
  soaking_hourly_over_2h: 'Soaking hourly for over 2 hours',
  clots_over_2_5cm: 'Clots over 2.5 cm',
  stops_daily_activities: 'Stops daily activities',
  severe_stops_activities: 'Severe (stops activities)',
  clear_stretchy: 'Clear and stretchy',
  no_symptoms: 'No symptoms',
  no_particular_mood: 'No particular mood',
  thoughts_of_self_harm: 'Thoughts of self-harm',
  external_condom: 'External condom',
  internal_condom: 'Internal condom',
  copper_iud: 'Copper IUD',
  hormonal_method: 'Hormonal method',
  faint_unclear: 'Faint or unclear',
  emergency_contraception: 'Emergency contraception',
  break_day: 'Break day',
  hot_flushes: 'Hot flushes',
  night_sweats: 'Night sweats',
  joint_aches: 'Joint aches',
  vaginal_dryness: 'Vaginal dryness',
  libido_change: 'Libido change',
};

export function optionLabel(value: string): string {
  return (
    SPECIAL_LABELS[value] ??
    value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}
