import type {
  Comfort,
  Contraception,
  Desire,
  Discharge,
  Flow,
  Level,
  Mood,
  Pain,
  Satisfaction,
  ShareCategory,
  SleepQuality,
  Symptom,
} from '../data/types.ts';

export const FLOW_LABEL: Record<Flow, string> = {
  none: 'None',
  spotting: 'Spotting',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  very_heavy: 'Very heavy',
};

export const PAIN_LABEL: Record<Pain, string> = {
  none: 'None',
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

export const DISCHARGE_LABEL: Record<Discharge, string> = {
  none: 'None',
  dry: 'Dry',
  sticky: 'Sticky',
  creamy: 'Creamy',
  watery: 'Watery',
  egg_white: 'Egg white',
  brown: 'Brown',
  unusual: 'Unusual',
};

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  back_pain: 'Back pain',
  pelvic_pain: 'Pelvic pain',
  breast_tenderness: 'Tender breasts',
  bloating: 'Bloating',
  nausea: 'Nausea',
  acne: 'Acne',
  fatigue: 'Tired',
  cravings: 'Cravings',
  insomnia: 'Trouble sleeping',
  vaginal_dryness: 'Vaginal dryness',
  dizziness: 'Dizzy or faint',
  breathlessness: 'Short of breath',
  chest_pain: 'Chest pain',
};

export const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Happy',
  calm: 'Calm',
  loving: 'Loving',
  playful: 'Playful',
  confident: 'Confident',
  irritable: 'Irritable',
  anxious: 'Anxious',
  sad: 'Sad',
  low: 'Low',
  mood_swings: 'Mood swings',
};

export const LEVEL_LABEL: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export const DESIRE_LABEL: Record<Desire, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const COMFORT_LABEL: Record<Comfort, string> = {
  painful: 'Painful',
  uncomfortable: 'Uncomfortable',
  okay: 'Okay',
  comfortable: 'Comfortable',
};

export const SATISFACTION_LABEL: Record<Satisfaction, string> = {
  low: 'Not great',
  okay: 'Okay',
  high: 'Great',
};

export const SLEEP_QUALITY_LABEL: Record<SleepQuality, string> = {
  poor: 'Poor',
  okay: 'Okay',
  good: 'Good',
};

export const CONTRACEPTION_LABEL: Record<Contraception, string> = {
  none: 'None',
  hormonal_iud: 'Hormonal IUD',
  copper_iud: 'Copper IUD',
  other_hormonal: 'Other hormonal method (pill, patch, ring, shot, implant)',
  other: 'Something else (condoms, other)',
};

export const CATEGORY_LABEL: Record<ShareCategory, { title: string; detail: string }> = {
  period: { title: 'Period', detail: 'Period days, flow, pain and the next-period estimate' },
  fertility: { title: 'Fertile window', detail: 'Only shown when the app has an estimate' },
  body: { title: 'Body', detail: 'Symptoms, energy and discharge' },
  mood: { title: 'Mood', detail: 'Moods you log' },
  desire: { title: 'Desire', detail: 'How much you felt like sex' },
  sex: { title: 'Sex', detail: 'Days you had sex, comfort and how it was' },
  habits: { title: 'Habits', detail: 'Sleep, activity, alcohol and water' },
};
