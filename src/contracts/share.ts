/**
 * Sharing contracts (architecture.md §4.3–4.4; security-privacy.md §2).
 *
 * The shared area holds only *projections*: minimal, category-specific
 * payloads built on her device. Raw private records are never sealed with a
 * category key (CR-08). `PROJECTION_FIELDS` is the allowlist of payload
 * fields per category; the type assertions check it matches the types.
 * Notes, tests, contraception, sex logs, BBT and warnings have no category.
 */
import type { ContentCardId } from './brand.ts';
import type {
  LifeStage,
  Mood,
  PhaseBin,
  ShareCategory,
  SharedChanceCategory,
  SharedOverviewPhase,
  SymptomBody,
} from './enums.ts';
import type { EngineOutput } from './engine-api.ts';
import type { DayLog, ShareSetting } from './entities.ts';
import type { LocalDate, LocalDateRange } from './localdate.ts';

/**
 * Payload used when a category is on but there is nothing to show. It
 * carries no reason, so a suppression cause (method, pregnancy, lateness)
 * is never disclosed through another category (CR-09).
 */
export interface NotAvailablePayload {
  readonly status: 'not_available';
}

/** `cycle_overview`: cycle day, phase name, period in progress yes/no. */
export type CycleOverviewPayload =
  | {
      readonly status: 'overview';
      readonly cycleDay: number;
      readonly phase: SharedOverviewPhase;
      readonly periodInProgress: boolean;
    }
  | NotAvailablePayload;

/** `period_prediction`: next period window; the countdown is derived by the viewer. */
export type PeriodPredictionPayload =
  | {
      readonly status: 'window';
      readonly center: LocalDate;
      readonly lo: LocalDate;
      readonly hi: LocalDate;
    }
  | NotAvailablePayload;

/**
 * `fertility_estimate`: core window and pregnancy-chance category. Only the
 * Higher/Medium/Lower categories are shareable; the uncertainty banner is
 * fixed renderer text, always shown.
 */
export type FertilityEstimatePayload =
  | {
      readonly status: 'estimate';
      readonly coreWindow: LocalDateRange;
      readonly chanceByDay: Readonly<Record<LocalDate, SharedChanceCategory>>;
    }
  | NotAvailablePayload;

/**
 * `intimacy_tendencies`: the F-118 summary only, as phase-bin ids. The
 * renderer adds the fixed reviewed text (CR-14); no logs, metrics or counts
 * are shared.
 */
export type IntimacyTendenciesPayload =
  { readonly status: 'summary'; readonly bins: readonly PhaseBin[] } | NotAvailablePayload;

/**
 * `support_requests`: the category enables the feature; each card is sent
 * deliberately as a couple entry, so the projection carries no card content.
 */
export interface SupportRequestsPayload {
  readonly status: 'enabled';
}

/** `life_stage`: her mode. */
export interface LifeStagePayload {
  readonly status: 'mode';
  readonly lifeStage: LifeStage;
}

/** `pregnancy_progress`: gestational week and generic milestone cards. */
export type PregnancyProgressPayload =
  | {
      readonly status: 'progress';
      readonly gestationalWeek: number;
      readonly milestoneCardIds: readonly ContentCardId[];
    }
  | NotAvailablePayload;

/** `symptoms_selected`: only symptoms she ticked for sharing, per day (CR-12). */
export interface SymptomsSelectedPayload {
  readonly status: 'days';
  readonly days: readonly {
    readonly localDate: LocalDate;
    readonly symptoms: readonly SymptomBody[];
  }[];
}

/** `mood_selected`: only moods she ticked for sharing, per day (CR-12). */
export interface MoodSelectedPayload {
  readonly status: 'days';
  readonly days: readonly { readonly localDate: LocalDate; readonly moods: readonly Mood[] }[];
}

export interface ProjectionPayloadByCategory {
  readonly cycle_overview: CycleOverviewPayload;
  readonly period_prediction: PeriodPredictionPayload;
  readonly fertility_estimate: FertilityEstimatePayload;
  readonly intimacy_tendencies: IntimacyTendenciesPayload;
  readonly support_requests: SupportRequestsPayload;
  readonly life_stage: LifeStagePayload;
  readonly pregnancy_progress: PregnancyProgressPayload;
  readonly symptoms_selected: SymptomsSelectedPayload;
  readonly mood_selected: MoodSelectedPayload;
}

/** Allowed top-level payload fields per category (CR-08 projection schema). */
export const PROJECTION_FIELDS = {
  cycle_overview: ['status', 'cycleDay', 'phase', 'periodInProgress'],
  period_prediction: ['status', 'center', 'lo', 'hi'],
  fertility_estimate: ['status', 'coreWindow', 'chanceByDay'],
  intimacy_tendencies: ['status', 'bins'],
  support_requests: ['status'],
  life_stage: ['status', 'lifeStage'],
  pregnancy_progress: ['status', 'gestationalWeek', 'milestoneCardIds'],
  symptoms_selected: ['status', 'days'],
  mood_selected: ['status', 'days'],
} as const satisfies { readonly [C in ShareCategory]: readonly string[] };

/** A replace-in-place snapshot for one category and epoch (architecture.md §5.1). */
export type Projection = {
  readonly [C in ShareCategory]: {
    readonly category: C;
    readonly epoch: number;
    readonly generatedFor: LocalDate;
    readonly payload: ProjectionPayloadByCategory[C];
  };
}[ShareCategory];

export type ProjectionOf<C extends ShareCategory> = Extract<Projection, { readonly category: C }>;

/** Everything the projection builder may read, all on her device. */
export interface ProjectionSource {
  readonly today: LocalDate;
  readonly lifeStage: LifeStage;
  readonly engineOutput: EngineOutput;
  /** Used only for the per-entry `shareSelection` of each day (CR-12). */
  readonly dayLogs: readonly DayLog[];
  /** Generic pregnancy milestone cards for the current week, if any. */
  readonly pregnancyMilestoneCardIds: readonly ContentCardId[];
}

export type ShareTarget = ShareCategory | 'all';

/**
 * Owner-device-only sharing service. The partner device has no instance:
 * it holds no PDK and has no edit API (CR-07).
 */
export interface ShareService {
  settings(): Promise<readonly ShareSetting[]>;
  /** Turns a category on and wraps only CK_{c,e} to the partner (CR-02). */
  enable(category: ShareCategory, options?: { readonly startDate?: LocalDate }): Promise<void>;
  /** Stops publishing in the same transaction. No reason is asked or stored (CR-04). */
  pause(target: ShareTarget): Promise<void>;
  resume(category: ShareCategory): Promise<void>;
  /** Rotates to epoch e+1 (not wrapped to him), deletes old slots, sends a signed request (CR-05). */
  revoke(target: ShareTarget): Promise<void>;
  /** CR-11 sharing-start date. */
  setStartDate(target: ShareTarget, startDate: LocalDate): Promise<void>;
  /** Decrypts the same published ciphertext he receives (CR-03); `null` if none. */
  preview(category: ShareCategory): Promise<Projection | null>;
  /**
   * Pure projection builder. Returns `null` when nothing may be published,
   * including a life-stage suppression, which must look identical to a
   * pause (CR-09). Applies the start date (CR-11).
   */
  buildProjection<C extends ShareCategory>(
    setting: ShareSetting & { readonly category: C },
    source: ProjectionSource,
  ): ProjectionOf<C> | null;
}
