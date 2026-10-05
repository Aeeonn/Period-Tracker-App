/**
 * Engine contract (algorithms-spec.md §0). The engine is pure and
 * deterministic: no clock, randomness or locale access (E1); output does not
 * depend on `dayLogs` order (E2); all date arithmetic goes through A0 (E7).
 */
import type {
  ChanceCategory,
  CycleExclusionReason,
  EddSource,
  EpisodeFlag,
  EpisodeKind,
  LifeStage,
  OvulationSource,
  PeriAgeBand,
  PeriSignal,
  PhaseBin,
  PredictionState,
  SuppressionReason,
  SymptomBody,
  TendencyDirection,
  TendencyMetric,
  TendencyStatus,
  Trimester,
  VariabilityLabel,
  WarningRuleId,
  WarningSeverity,
} from './enums.ts';
import type {
  ContraceptionState,
  CoupleEntry,
  DayLog,
  EpisodeOverride,
  PregnancyRecord,
} from './entities.ts';
import type { LocalDate, LocalDateRange } from './localdate.ts';

export const ENGINE_VERSION = 'cycle-engine/1.0.0' as const;
export type EngineVersion = typeof ENGINE_VERSION;

/* ------------------------------------------------------------------------ */
/* Input                                                                     */
/* ------------------------------------------------------------------------ */

export interface EngineProfile {
  readonly birthYear?: number;
  readonly typicalCycleLength?: number;
  readonly typicalPeriodLength?: number;
  readonly lifeStage: LifeStage;
  readonly contraception: readonly ContraceptionState[];
}

export interface EngineInput {
  /** Device-local "today", passed in, never read inside the engine. */
  readonly today: LocalDate;
  readonly profile: EngineProfile;
  /** Decrypted, merged, tombstones already removed. */
  readonly dayLogs: readonly DayLog[];
  /** "This was/wasn't a period start", manual cycle exclusions. */
  readonly episodesOverride: readonly EpisodeOverride[];
  readonly pregnancies: readonly PregnancyRecord[];
  /** Only entries she has allowed (CR-13). */
  readonly coupleEntriesAllowedForInsights: readonly CoupleEntry[];
}

/* ------------------------------------------------------------------------ */
/* Parameters (algorithms-spec.md "Parameters v1"). Values live in the       */
/* engine (`PARAMS_V1`); their hash is `paramsHash`.                         */
/* ------------------------------------------------------------------------ */

export interface InclusiveIntRange {
  readonly min: number;
  readonly max: number;
}

export interface EngineParams {
  readonly historyMaxCycles: number;
  readonly maxCycleLen: number;
  readonly maxCycleAgeDays: number;
  readonly minCycleLen: number;
  readonly recencyDecay: number;
  readonly defaultCycleLen: number;
  readonly defaultPeriodLen: number;
  readonly halfWidthNoHistory: { readonly unknownTypical: number; readonly typicalGiven: number };
  /** Margin by number of valid cycles: n=1, n=2, n=3–5, n≥6. */
  readonly smallSamplePenalty: {
    readonly n1: number;
    readonly n2: number;
    readonly n3to5: number;
    readonly n6plus: number;
  };
  readonly halfWidthClamp: InclusiveIntRange;
  readonly lutealRange: InclusiveIntRange & { readonly convention: number };
  readonly lutealPlausible: InclusiveIntRange;
  /** Core window offsets relative to ovulation, e.g. −5 … +1. */
  readonly coreWindow: { readonly before: number; readonly after: number };
  /** Missed-log ratio bounds, e.g. 1.6 … 2.4 × typical length. */
  readonly missedLogRatio: { readonly min: number; readonly max: number };
}

/* ------------------------------------------------------------------------ */
/* Output                                                                    */
/* ------------------------------------------------------------------------ */

/** A1 bleeding episode. */
export interface Episode {
  readonly start: LocalDate;
  readonly end: LocalDate;
  /** Confirmed bleeding days (assumed days excluded). */
  readonly bleedingDays: number;
  readonly spottingDays: readonly LocalDate[];
  readonly assumedDays: readonly LocalDate[];
  readonly kind: EpisodeKind;
  readonly flags: readonly EpisodeFlag[];
}

/** A2 interval between consecutive period starts. */
export interface CycleStat {
  readonly start: LocalDate;
  readonly nextStart: LocalDate;
  readonly length: number;
  /** Absent when the cycle is used for statistics. */
  readonly excludedBecause?: CycleExclusionReason;
  /** Missed-log prompt date ("around <s_i + Lref>"). */
  readonly missedLogPromptDate?: LocalDate;
}

/** A2 next-period prediction. Invariant E3: `lo <= center <= hi`. */
export interface PeriodPrediction {
  readonly kind: 'prediction';
  readonly center: LocalDate;
  readonly lo: LocalDate;
  readonly hi: LocalDate;
  readonly state: PredictionState;
  /** Present when `state` is `late`. */
  readonly daysLate?: number;
  /** Number of valid cycles used (n). */
  readonly cyclesUsed: number;
  readonly halfWidth: number;
  readonly variability?: VariabilityLabel;
  /** A3 estimate. */
  readonly expectedPeriodLength: number;
}

/** A suppressed output, with the first matching reason (A4 order). */
export interface Suppressed {
  readonly kind: 'suppressed';
  readonly reason: SuppressionReason;
}

/** A4 / A9 fertility estimate. */
export interface FertilityEstimate {
  readonly kind: 'fertility';
  readonly source: OvulationSource;
  readonly ovulationCenter: LocalDate;
  readonly ovulationRange: LocalDateRange;
  readonly coreWindow: LocalDateRange;
  readonly possibleBand: LocalDateRange;
  readonly higherDays: LocalDateRange;
  readonly markersDisagree: boolean;
  /** Copper IUD: shown greyed with the "doesn't change ovulation" note (A4). */
  readonly methodDoesNotChangeOvulation: boolean;
}

/** A11 warning card. Not a diagnosis; every card says "talk to a clinician". */
export interface WarningCard {
  readonly ruleId: WarningRuleId;
  readonly severity: WarningSeverity;
  /** EMERGENCY cards and W-11 cannot be dismissed while the condition holds. */
  readonly dismissible: boolean;
  /** Start of the episode or cycle that scopes dismissal. */
  readonly scopeStart: LocalDate;
  /** Logged days that triggered the rule. */
  readonly evidenceDates: readonly LocalDate[];
}

/** A12 per-bin result. */
export interface TendencyBinResult {
  readonly bin: PhaseBin;
  readonly direction: TendencyDirection;
  readonly loggedDays: number;
  readonly cycles: number;
}

/** A12 report for one metric. Separate from fertility (CR-15). */
export interface TendencyReport {
  readonly metric: TendencyMetric;
  /** Present for `watched_symptom`. */
  readonly symptom?: SymptomBody;
  readonly status: TendencyStatus;
  /** Present for `TENDENCY` and `RECENTLY_CHANGED`. */
  readonly bins: readonly TendencyBinResult[];
  readonly cyclesWithData: number;
  readonly coverage: { readonly loggedDays: number; readonly totalDays: number };
  /** Chance-check p value, present when computed. */
  readonly pValue?: number;
}

/** A10 pregnancy dating. The app never redates automatically. */
export interface PregnancyDating {
  readonly edd: LocalDate;
  readonly eddSource: EddSource;
  readonly gestationalAgeDays: number;
  readonly trimester: Trimester;
  readonly redatingDiscrepancyDays?: number;
}

/** A14 perimenopause signals and summary. */
export interface PeriSignals {
  readonly signals: readonly PeriSignal[];
  readonly ageBand: PeriAgeBand;
  /** Hormonal contraception or HRT suppresses signals (A14). */
  readonly suppressedByConfounder: boolean;
  /** 0–100 impact score of the latest month, if logged. */
  readonly impactScore?: number;
}

/** Which output an explanation belongs to. */
export type ExplanationTopic =
  | 'episodes'
  | 'cycles'
  | 'prediction'
  | 'fertility'
  | 'chance'
  | 'warnings'
  | 'tendencies'
  | 'pregnancy_dating'
  | 'perimenopause';

/** Human-readable "why", one per output, as reviewed message keys plus values. */
export interface Explanation {
  readonly topic: ExplanationTopic;
  readonly messageKey: string;
  readonly values: Readonly<Record<string, string | number>>;
}

export interface EngineOutput {
  readonly engineVersion: EngineVersion;
  readonly paramsHash: string;
  readonly episodes: readonly Episode[];
  readonly cycles: readonly CycleStat[];
  readonly prediction: PeriodPrediction | Suppressed;
  readonly fertility: FertilityEstimate | Suppressed;
  /** Never zero, "none" or a no-risk label (E4). */
  readonly chanceByDay: Readonly<Record<LocalDate, ChanceCategory>>;
  readonly warnings: readonly WarningCard[];
  readonly tendencies: readonly TendencyReport[];
  readonly pregnancyDating?: PregnancyDating;
  readonly perimenopause?: PeriSignals;
  readonly explanations: readonly Explanation[];
}

/** `runEngine(input, params = PARAMS_V1)` (algorithms-spec.md §0). */
export type RunEngine = (input: EngineInput, params?: EngineParams) => EngineOutput;
