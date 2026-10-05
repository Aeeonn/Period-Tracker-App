/**
 * Versioned enumerations (architecture.md §5.2 "every value is versioned in
 * `src/contracts/enums.ts`"). Labels are original identifiers, not copy: the
 * UI maps each value to reviewed wording.
 *
 * Compatibility rule: values are only ever added. Removing or renaming a value,
 * or changing a numeric score, needs an ADR, a foundation task, a migration
 * and an `ENUM_VERSION` bump. Stored records keep the identifiers below.
 *
 * Everything here is a pure constant table; there is no logic.
 */

export const ENUM_VERSION = 1 as const;
export type EnumVersion = typeof ENUM_VERSION;

/* ------------------------------------------------------------------------ */
/* Logging trackers (architecture.md §5.2)                                   */
/* ------------------------------------------------------------------------ */

/** Every tracker row of architecture.md §5.2, in table order. */
export const TRACKERS = [
  'flow',
  'heavy_detail',
  'period_pain',
  'discharge',
  'symptoms_body',
  'mood',
  'energy',
  'stress',
  'desire',
  'sex',
  'tests',
  'bbt',
  'ovulation_manual',
  'pill_intake',
  'medication',
  'weight',
  'water',
  'sleep',
  'activity',
  'alcohol',
  'notes',
  'peri_impact',
  'lochia',
] as const;
export type Tracker = (typeof TRACKERS)[number];

/** Trackers that hold a set of values per day (marked "multi" in §5.2). */
export const MULTI_VALUE_TRACKERS = [
  'heavy_detail',
  'symptoms_body',
  'mood',
  'medication',
] as const satisfies readonly Tracker[];

export const FLOW = ['none', 'spotting', 'light', 'medium', 'heavy', 'very_heavy'] as const;
export type Flow = (typeof FLOW)[number];

export const HEAVY_DETAIL = [
  'change_every_1_2h',
  'soaking_hourly_over_2h',
  'clots_over_2_5cm',
  'flooding',
  'stops_daily_activities',
] as const;
export type HeavyDetail = (typeof HEAVY_DETAIL)[number];

export const PERIOD_PAIN = ['none', 'mild', 'moderate', 'severe_stops_activities'] as const;
export type PeriodPain = (typeof PERIOD_PAIN)[number];

export const DISCHARGE = [
  'none',
  'dry',
  'sticky',
  'creamy',
  'watery',
  'clear_stretchy',
  'brown',
  'unusual_colour',
  'unusual_smell',
  'itchy',
] as const;
export type Discharge = (typeof DISCHARGE)[number];

/** Cervical-mucus scale of the scored discharge values (§5.2, A8). */
export const DISCHARGE_MUCUS_SCORE = {
  dry: 0,
  sticky: 1,
  creamy: 2,
  watery: 3,
  clear_stretchy: 4,
} as const satisfies Partial<Record<Discharge, 0 | 1 | 2 | 3 | 4>>;
export type MucusDischarge = keyof typeof DISCHARGE_MUCUS_SCORE;
export type MucusScore = (typeof DISCHARGE_MUCUS_SCORE)[MucusDischarge];

export const SYMPTOMS_BODY = [
  'cramps',
  'headache',
  'migraine',
  'back_pain',
  'pelvic_pain',
  'one_sided_pain',
  'shoulder_tip_pain',
  'breast_tenderness',
  'bloating',
  'nausea',
  'vomiting',
  'diarrhea',
  'constipation',
  'painful_bowel_movements',
  'painful_urination',
  'frequent_urination',
  'pelvic_pressure',
  'acne',
  'oily_skin',
  'dry_skin',
  'excess_hair_growth',
  'scalp_hair_thinning',
  'fatigue',
  'dizziness',
  'fainting',
  'chest_pain',
  'breathlessness',
  'fever',
  'chills',
  'hot_flush',
  'night_sweats',
  'insomnia',
  'joint_aches',
  'concentration_difficulty',
  'food_cravings',
  'increased_appetite',
  'low_appetite',
  'swelling',
  'vaginal_dryness',
  'vaginal_itching',
  'no_symptoms',
] as const;
export type SymptomBody = (typeof SYMPTOMS_BODY)[number];

export const MOOD = [
  'happy',
  'calm',
  'content',
  'loving',
  'playful',
  'confident',
  'energetic',
  'irritable',
  'angry',
  'anxious',
  'sad',
  'low',
  'tearful',
  'mood_swings',
  'stressed',
  'overwhelmed',
  'numb',
  'self_critical',
  'thoughts_of_self_harm',
  'no_particular_mood',
] as const;
export type Mood = (typeof MOOD)[number];

/** Ordinal 0–3 scale used by `energy`, `stress`, sleep quality and peri items. */
export const ZERO_TO_THREE = [0, 1, 2, 3] as const;
export type ZeroToThree = (typeof ZERO_TO_THREE)[number];

/** `energy` values (§5.2: 0–3). */
export const ENERGY = ZERO_TO_THREE;
export type Energy = ZeroToThree;

/** `stress` values (§5.2: 0–3). */
export const STRESS = ZERO_TO_THREE;
export type Stress = ZeroToThree;

export const DESIRE = ['none', 'low', 'medium', 'high'] as const;
export type Desire = (typeof DESIRE)[number];

/* `sex` (per event, private) */
export const SEX_ACTIVITY = ['vaginal', 'oral', 'manual', 'anal', 'solo', 'other'] as const;
export type SexActivity = (typeof SEX_ACTIVITY)[number];

export const SEX_PROTECTION = [
  'none',
  'external_condom',
  'internal_condom',
  'withdrawal',
  'hormonal_method',
  'copper_iud',
  'other',
] as const;
export type SexProtection = (typeof SEX_PROTECTION)[number];

export const SEX_COMFORT = ['painful', 'uncomfortable', 'okay', 'comfortable'] as const;
export type SexComfort = (typeof SEX_COMFORT)[number];

export const SEX_SATISFACTION = ['low', 'ok', 'high', 'skip'] as const;
export type SexSatisfaction = (typeof SEX_SATISFACTION)[number];

export const SEX_BLEEDING_AFTER = ['yes', 'no'] as const;
export type SexBleedingAfter = (typeof SEX_BLEEDING_AFTER)[number];

/* `tests` */
export const PREGNANCY_TEST_RESULT = ['positive', 'negative', 'faint_unclear', 'invalid'] as const;
export type PregnancyTestResult = (typeof PREGNANCY_TEST_RESULT)[number];

export const LH_TEST_RESULT = ['negative', 'high', 'peak', 'invalid'] as const;
export type LhTestResult = (typeof LH_TEST_RESULT)[number];

/** STI test result; the STI test entry itself is private and never shareable. */
export const STI_TEST_RESULT = ['positive', 'negative', 'pending'] as const;
export type StiTestResult = (typeof STI_TEST_RESULT)[number];

export const EMERGENCY_CONTRACEPTION = [
  'levonorgestrel',
  'ulipristal',
  'copper_iud',
  'other',
] as const;
export type EmergencyContraception = (typeof EMERGENCY_CONTRACEPTION)[number];

/* `bbt` */
export const BBT_DISTURBANCE = [
  'fever',
  'alcohol',
  'short_sleep',
  'measured_late',
  'illness',
  'travel',
] as const;
export type BbtDisturbance = (typeof BBT_DISTURBANCE)[number];
/** BBT is stored in °C with 2 decimals (§5.2). */
export const BBT_CELSIUS_DECIMALS = 2 as const;

export const OVULATION_MANUAL = ['yes'] as const;
export type OvulationManual = (typeof OVULATION_MANUAL)[number];

export const PILL_INTAKE = ['taken', 'missed', 'late', 'break_day'] as const;
export type PillIntake = (typeof PILL_INTAKE)[number];

/** Weight is stored in kg with 1 decimal (§5.2). */
export const WEIGHT_KG_DECIMALS = 1 as const;

/** Sleep hours are recorded in 0.5-hour steps; quality uses `ZERO_TO_THREE` (§5.2). */
export const SLEEP_HOURS_STEP = 0.5 as const;

export const ACTIVITY_TYPE = ['walk', 'run', 'gym', 'yoga', 'cycling', 'sport', 'other'] as const;
export type ActivityType = (typeof ACTIVITY_TYPE)[number];

/** Alcohol units, inclusive range 0–20 (§5.2). */
export const ALCOHOL_UNITS_MIN = 0 as const;
export const ALCOHOL_UNITS_MAX = 20 as const;

/** The ten `peri_impact` items, each rated 0–3 once a month (§5.2, A14). */
export const PERI_IMPACT_ITEMS = [
  'hot_flushes',
  'night_sweats',
  'sleep',
  'mood',
  'anxiety',
  'joint_aches',
  'concentration',
  'vaginal_dryness',
  'libido_change',
  'fatigue',
] as const;
export type PeriImpactItem = (typeof PERI_IMPACT_ITEMS)[number];

export const LOCHIA = ['none', 'light', 'moderate', 'heavy'] as const;
export type Lochia = (typeof LOCHIA)[number];

/* ------------------------------------------------------------------------ */
/* Entity enumerations (architecture.md §4.3, §5.1, §6; ux-spec.md §3)        */
/* ------------------------------------------------------------------------ */

export const DEVICE_ROLES = ['owner', 'partner'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

export const GOALS = ['track', 'avoid_pregnancy', 'ttc'] as const;
export type Goal = (typeof GOALS)[number];

/** Life-stage modes (architecture.md §1 and the `life_stage` category, §4.3). */
export const LIFE_STAGES = ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** ISO 8601 weekday numbers: 1 = Monday … 7 = Sunday. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

export const PERIOD_OVERRIDE_KINDS = [
  'start',
  'not_start',
  'exclude_cycle',
  'confirm_long_cycle',
] as const;
export type PeriodOverrideKind = (typeof PERIOD_OVERRIDE_KINDS)[number];

/**
 * Contraception methods: the methods named in algorithms-spec.md A4/A16 plus
 * the onboarding choices "none" and "prefer not to say" (ux-spec.md §3.1).
 */
export const CONTRACEPTION_METHODS = [
  'none',
  'combined_pill',
  'progestogen_only_pill',
  'patch',
  'ring',
  'hormonal_iud',
  'implant',
  'injection',
  'copper_iud',
  'condoms',
  'prefer_not_to_say',
] as const;
export type ContraceptionMethod = (typeof CONTRACEPTION_METHODS)[number];

export const EDD_SOURCES = ['lmp', 'clinician', 'ivf', 'conception'] as const;
export type EddSource = (typeof EDD_SOURCES)[number];

export const PREGNANCY_OUTCOMES = ['birth', 'loss', 'ended'] as const;
export type PregnancyOutcome = (typeof PREGNANCY_OUTCOMES)[number];

/** Reminder rule kinds listed in ux-spec.md §3.7. */
export const REMINDER_KINDS = [
  'period_start_window',
  'still_bleeding',
  'daily_symptom_log',
  'pill',
  'custom',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_CONDITIONS = [
  'always',
  'during_bleeding',
  'near_predicted_start',
  'pill_schedule',
] as const;
export type ReminderCondition = (typeof REMINDER_CONDITIONS)[number];

/** Share categories (architecture.md §4.3). All are off by default (CR-01). */
export const SHARE_CATEGORIES = [
  'cycle_overview',
  'period_prediction',
  'fertility_estimate',
  'intimacy_tendencies',
  'support_requests',
  'life_stage',
  'pregnancy_progress',
  'symptoms_selected',
  'mood_selected',
] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

/** Initial state of every category (CR-01). */
export const DEFAULT_SHARE_STATE = 'off' as const;

export const SHARE_STATES = ['off', 'on', 'paused', 'revoked'] as const;
export type ShareState = (typeof SHARE_STATES)[number];

export const COUPLE_ENTRY_KINDS = [
  'date',
  'sex',
  'note',
  'love_note',
  'support_request',
  'checkin',
] as const;
export type CoupleEntryKind = (typeof COUPLE_ENTRY_KINDS)[number];

/** Her display choice for love notes (CR-18; ux-spec.md §3.9). */
export const LOVE_NOTE_DISPLAY_MODES = ['off', 'today', 'collection'] as const;
export type LoveNoteDisplayMode = (typeof LOVE_NOTE_DISPLAY_MODES)[number];

export const CONSENT_ACTIONS = [
  'share_on',
  'pause',
  'resume',
  'revoke',
  'start_date',
  'pair',
  'unpair',
] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/** Coarse plaintext record types of the `records` store (architecture.md §6). */
export const RECORD_TYPES = ['day', 'cfg', 'share', 'couple', 'proj', 'sys'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Sync transports (architecture.md §3, §4.5). */
export const SYNC_TRANSPORT_KINDS = ['relay', 'file'] as const;
export type SyncTransportKind = (typeof SYNC_TRANSPORT_KINDS)[number];

/** Signed control messages (architecture.md §4.5; storage-sync-decision.md §4; security-privacy.md §5). */
export const CONTROL_MESSAGE_KINDS = ['revoke', 'unpair', 'purge'] as const;
export type ControlMessageKind = (typeof CONTROL_MESSAGE_KINDS)[number];

/* ------------------------------------------------------------------------ */
/* Engine enumerations (algorithms-spec.md)                                   */
/* ------------------------------------------------------------------------ */

/** A1 episode kinds. */
export const EPISODE_KINDS = ['period', 'withdrawal', 'postpartum_lochia', 'unknown'] as const;
export type EpisodeKind = (typeof EPISODE_KINDS)[number];

/** A1 episode flags: two bleeding episodes closer than `minCycleLen`. */
export const EPISODE_FLAGS = ['short_interval'] as const;
export type EpisodeFlag = (typeof EPISODE_FLAGS)[number];

/** A2 reasons a cycle is left out of prediction statistics. */
export const CYCLE_EXCLUSION_REASONS = [
  'too_short',
  'too_long',
  'too_old',
  'manual',
  'pregnancy_or_postpartum',
  'hormonal_method',
  'possible_missed_log',
] as const;
export type CycleExclusionReason = (typeof CYCLE_EXCLUSION_REASONS)[number];

/** A2 prediction states. */
export const PREDICTION_STATES = ['upcoming', 'expected_now', 'late'] as const;
export type PredictionState = (typeof PREDICTION_STATES)[number];

/** A2 variability labels. */
export const VARIABILITY_LABELS = ['regular', 'variable'] as const;
export type VariabilityLabel = (typeof VARIABILITY_LABELS)[number];

/** A4/A16 suppression reasons, in A4 precedence order. */
export const SUPPRESSION_REASONS = [
  'pregnant',
  'postpartum_before_first_period',
  'hormonal',
  'late',
  'cycle_length',
  'no_data',
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** A9 sources of an ovulation estimate, highest priority first. */
export const OVULATION_SOURCES = ['manual', 'lh', 'bbt', 'mucus', 'calendar'] as const;
export type OvulationSource = (typeof OVULATION_SOURCES)[number];

/**
 * A5 pregnancy-chance categories. None of them is zero, "none" or a
 * no-risk label (invariant E4).
 */
export const CHANCE_CATEGORIES = [
  'HIGHER',
  'MEDIUM',
  'LOWER',
  'PREGNANT_NOT_SHOWN',
  'POSSIBLE_BEFORE_FIRST_PERIOD',
  'DEPENDS_ON_METHOD',
  'UNKNOWN_TEST',
  'NOT_ESTIMATED_CYCLE_LENGTH',
  'NO_DATA_YET',
] as const;
export type ChanceCategory = (typeof CHANCE_CATEGORIES)[number];

/** A5: the fixed category for every suppression reason (consistency check X11). */
export const SUPPRESSION_CHANCE_CATEGORY = {
  pregnant: 'PREGNANT_NOT_SHOWN',
  postpartum_before_first_period: 'POSSIBLE_BEFORE_FIRST_PERIOD',
  hormonal: 'DEPENDS_ON_METHOD',
  late: 'UNKNOWN_TEST',
  cycle_length: 'NOT_ESTIMATED_CYCLE_LENGTH',
  no_data: 'NO_DATA_YET',
} as const satisfies Record<SuppressionReason, ChanceCategory>;

/**
 * Cycle phase labels used by content tagging (A17) and the Today screen.
 * `fertile` is a fertility-derived label; see `SHARED_OVERVIEW_PHASES`.
 */
export const CYCLE_PHASES = ['period', 'follicular', 'fertile', 'luteal'] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

/**
 * Phase names allowed in the shared `cycle_overview` projection. The fertile
 * label is excluded so that the overview never discloses the fertility
 * estimate, which has its own category (CR-02).
 */
export const SHARED_OVERVIEW_PHASES = [
  'period',
  'follicular',
  'luteal',
] as const satisfies readonly CyclePhase[];
export type SharedOverviewPhase = (typeof SHARED_OVERVIEW_PHASES)[number];

/** Pregnancy-chance categories allowed in the shared `fertility_estimate` projection. */
export const SHARED_CHANCE_CATEGORIES = [
  'HIGHER',
  'MEDIUM',
  'LOWER',
] as const satisfies readonly ChanceCategory[];
export type SharedChanceCategory = (typeof SHARED_CHANCE_CATEGORIES)[number];

/** A11 severities. */
export const WARNING_SEVERITIES = ['EMERGENCY', 'SEEK_ADVICE_SOON', 'DISCUSS', 'INFO'] as const;
export type WarningSeverity = (typeof WARNING_SEVERITIES)[number];

/** A11 rule ids. */
export const WARNING_RULE_IDS = [
  'W-01',
  'W-02',
  'W-03',
  'W-04',
  'W-05',
  'W-06',
  'W-07',
  'W-08',
  'W-09',
  'W-10',
  'W-11',
] as const;
export type WarningRuleId = (typeof WARNING_RULE_IDS)[number];

/** A12 analysed metrics (`watched_symptom` covers up to 3 chosen symptoms). */
export const TENDENCY_METRICS = [
  'desire',
  'energy',
  'comfort',
  'low_mood',
  'tense_mood',
  'watched_symptom',
] as const;
export type TendencyMetric = (typeof TENDENCY_METRICS)[number];

/** A12 phase bins B1–B5. */
export const PHASE_BINS = [
  'B1_period',
  'B2_after_period',
  'B3_mid_cycle',
  'B4_pre_period',
  'B5_after_mid_cycle',
] as const;
export type PhaseBin = (typeof PHASE_BINS)[number];

/** A12 statuses. */
export const TENDENCY_STATUSES = [
  'INSUFFICIENT',
  'RECENTLY_CHANGED',
  'NO_CLEAR_PATTERN',
  'TENDENCY',
] as const;
export type TendencyStatus = (typeof TENDENCY_STATUSES)[number];

export const TENDENCY_DIRECTIONS = ['higher', 'lower'] as const;
export type TendencyDirection = (typeof TENDENCY_DIRECTIONS)[number];

/** A14 perimenopause signals. */
export const PERI_SIGNALS = ['S1', 'S2', 'S3'] as const;
export type PeriSignal = (typeof PERI_SIGNALS)[number];

/** A14 age gating bands. */
export const PERI_AGE_BANDS = ['under_40', 'from_40_to_44', 'from_45', 'unknown'] as const;
export type PeriAgeBand = (typeof PERI_AGE_BANDS)[number];

/** A10 trimesters. */
export const TRIMESTERS = [1, 2, 3] as const;
export type Trimester = (typeof TRIMESTERS)[number];
