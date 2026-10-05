/**
 * Entities of architecture.md §5.1. Field names are logical; every entity is
 * stored only inside an encrypted record (architecture.md §6). Areas follow
 * architecture.md §4.3:
 *   - private (her PDK): Profile, DayBundle, PeriodOverride, ContraceptionState,
 *     PregnancyRecord, ReminderRule, PredictionSnapshot, ConsentEvent,
 *     ShareSetting, ShareEpochKey, CoupleFlag, BackupMeta, SyncState;
 *   - shared (CK per category and epoch): Projection only;
 *   - couple (CPK): CoupleEntry.
 */
import type {
  Base64Url,
  CoupleEntryId,
  DeviceId,
  KeyId,
  PregnancyId,
  ReminderId,
  SeqCursor,
  SpaceId,
} from './brand.ts';
import type {
  ActivityType,
  BbtDisturbance,
  ConsentAction,
  ContraceptionMethod,
  CoupleEntryKind,
  Desire,
  DeviceRole,
  Discharge,
  EddSource,
  EmergencyContraception,
  Energy,
  Flow,
  Goal,
  HeavyDetail,
  IsoWeekday,
  LhTestResult,
  LifeStage,
  Lochia,
  Mood,
  OvulationManual,
  PeriImpactItem,
  PeriodOverrideKind,
  PeriodPain,
  PillIntake,
  PregnancyOutcome,
  PregnancyTestResult,
  ReminderCondition,
  ReminderKind,
  SexActivity,
  SexBleedingAfter,
  SexComfort,
  SexProtection,
  SexSatisfaction,
  ShareCategory,
  ShareState,
  StiTestResult,
  Stress,
  SymptomBody,
  TemperatureUnit,
  Theme,
  WeightUnit,
  ZeroToThree,
} from './enums.ts';
import type { LocalDate, LocalDateTime, LocalTime } from './localdate.ts';
import type { EcdhWrappedKey } from './crypto.ts';
import type { Projection } from './share.ts';

/* ------------------------------------------------------------------------ */
/* Hybrid logical clock (architecture.md §4.5)                               */
/* ------------------------------------------------------------------------ */

/**
 * Hybrid logical clock stamp: ordering metadata only, never a health date
 * (A0). Ordered by `wallMs`, then `counter`, then `deviceId`.
 */
export interface Hlc {
  readonly wallMs: number;
  readonly counter: number;
  readonly deviceId: DeviceId;
}

/* ------------------------------------------------------------------------ */
/* Devices and profile                                                       */
/* ------------------------------------------------------------------------ */

export interface DeviceIdentity {
  readonly deviceId: DeviceId;
  readonly role: DeviceRole;
  /** ECDSA P-256 public key, SPKI encoded. */
  readonly signPub: Base64Url;
  /** ECDH P-256 public key, SPKI encoded. */
  readonly agreePub: Base64Url;
  readonly displayName: string;
  readonly createdAt: LocalDateTime;
}

export interface UnitPreferences {
  readonly temp: TemperatureUnit;
  readonly weight: WeightUnit;
}

export interface Profile {
  readonly birthYear?: number;
  readonly typicalCycleLength?: number;
  readonly typicalPeriodLength?: number;
  readonly goal: Goal;
  readonly lifeStage: LifeStage;
  readonly units: UnitPreferences;
  readonly weekStart: IsoWeekday;
  readonly theme: Theme;
  readonly lockTimeoutSec: number;
  readonly quickHideEnabled: boolean;
}

/* ------------------------------------------------------------------------ */
/* Daily logs (architecture.md §5.1 DayBundle, §5.2 trackers)                */
/* ------------------------------------------------------------------------ */

/** One private sex event (§5.2 `sex`). Never shareable. */
export interface SexEvent {
  readonly activity: readonly SexActivity[];
  readonly protection: readonly SexProtection[];
  readonly comfort?: SexComfort;
  readonly satisfaction?: SexSatisfaction;
  readonly bleeding_after?: SexBleedingAfter;
}

export interface StiTest {
  readonly taken: true;
  readonly result: StiTestResult;
}

/** §5.2 `tests`. Never shareable. */
export interface TestsLog {
  readonly pregnancy?: PregnancyTestResult;
  readonly lh?: LhTestResult;
  readonly sti?: StiTest;
  readonly emergency_contraception?: EmergencyContraception;
}

/** §5.2 `bbt`: stored in °C with 2 decimals regardless of display unit. */
export interface BbtReading {
  readonly valueC: number;
  readonly measuredAt: LocalTime;
  readonly disturbances: readonly BbtDisturbance[];
}

export interface MedicationEntry {
  /** Free text. */
  readonly name: string;
  readonly taken: boolean;
}

export interface SleepLog {
  /** 0.5-hour steps. */
  readonly hours: number;
  readonly quality: ZeroToThree;
}

export interface ActivityLog {
  readonly minutes: number;
  readonly type: ActivityType;
}

/** Monthly 10-item × 0–3 checklist (A14), recorded on one day of the month. */
export type PeriImpact = Readonly<Record<PeriImpactItem, ZeroToThree>>;

/**
 * Value of every tracker in architecture.md §5.2, keyed by tracker id.
 * Multi-value trackers hold a set (no duplicates). Numeric trackers use the
 * stored unit named in §5.2 (kg, ml, hours, minutes, units).
 */
export interface TrackerValues {
  readonly flow: Flow;
  readonly heavy_detail: readonly HeavyDetail[];
  readonly period_pain: PeriodPain;
  readonly discharge: Discharge;
  readonly symptoms_body: readonly SymptomBody[];
  readonly mood: readonly Mood[];
  readonly energy: Energy;
  readonly stress: Stress;
  readonly desire: Desire;
  readonly sex: readonly SexEvent[];
  readonly tests: TestsLog;
  readonly bbt: BbtReading;
  readonly ovulation_manual: OvulationManual;
  readonly pill_intake: PillIntake;
  readonly medication: readonly MedicationEntry[];
  /** kg, 1 decimal. */
  readonly weight: number;
  /** ml. */
  readonly water: number;
  readonly sleep: SleepLog;
  readonly activity: ActivityLog;
  /** Units, 0–20. */
  readonly alcohol: number;
  /** Free text; never shareable. */
  readonly notes: string;
  readonly peri_impact: PeriImpact;
  readonly lochia: Lochia;
}

/**
 * Per-entry sharing opt-in for one day (CR-12, F-101). Each list must be a
 * subset of that day's logged `symptoms_body` / `mood`; only these values may
 * ever reach the `symptoms_selected` / `mood_selected` projections.
 */
export interface DayShareSelection {
  readonly symptoms_body?: readonly SymptomBody[];
  readonly mood?: readonly Mood[];
}

/** Field names of a day that carry their own HLC. */
export type DayField = keyof TrackerValues | 'shareSelection';

/**
 * Decrypted, merged view of one day as the engine sees it
 * (algorithms-spec.md §0 `DayLog`). Absent trackers were not logged:
 * missing is never treated as "none" (A12).
 */
export type DayLog = { readonly localDate: LocalDate } & Partial<TrackerValues> & {
    readonly shareSelection?: DayShareSelection;
  };

/**
 * Stored day record (architecture.md §5.1): one per `LocalDate`, with an HLC
 * per field. A cleared field keeps its HLC and has no value (field tombstone).
 */
export type DayBundle = DayLog & {
  readonly fieldHlc: Readonly<Partial<Record<DayField, Hlc>>>;
};

export interface PeriodOverride {
  readonly localDate: LocalDate;
  readonly kind: PeriodOverrideKind;
}

/** algorithms-spec.md §0 name for her period overrides. */
export type EpisodeOverride = PeriodOverride;

/* ------------------------------------------------------------------------ */
/* Contraception, pregnancy, reminders                                       */
/* ------------------------------------------------------------------------ */

export interface ContraceptionRegimen {
  readonly activeDays: number;
  readonly breakDays: number;
  readonly continuous: boolean;
}

export interface ContraceptionState {
  readonly method: ContraceptionMethod;
  readonly startDate: LocalDate;
  readonly endDate?: LocalDate;
  readonly regimen: ContraceptionRegimen;
}

export interface IvfTransfer {
  readonly transferDate: LocalDate;
  readonly embryoAgeDays: number;
}

export interface PregnancyRecord {
  readonly id: PregnancyId;
  readonly lmp?: LocalDate;
  readonly edd?: LocalDate;
  readonly eddSource: EddSource;
  readonly ivf?: IvfTransfer;
  readonly fetusCount: number;
  readonly endedOn?: LocalDate;
  readonly outcome?: PregnancyOutcome;
}

export interface ReminderRule {
  readonly id: ReminderId;
  readonly kind: ReminderKind;
  readonly localTime: LocalTime;
  readonly days: readonly IsoWeekday[];
  readonly condition: ReminderCondition;
  readonly enabled: boolean;
}

/* ------------------------------------------------------------------------ */
/* Sharing (owner-side bookkeeping; private area)                            */
/* ------------------------------------------------------------------------ */

export interface ShareSetting {
  readonly category: ShareCategory;
  readonly state: ShareState;
  readonly epoch: number;
  /** CR-11: projections include only data dated on or after this date. */
  readonly startDate?: LocalDate;
  readonly updatedHlc: Hlc;
}

/** A category key CK_{c,e} wrapped to one recipient device. */
export interface DeviceWrappedKey {
  readonly deviceId: DeviceId;
  readonly wrapped: EcdhWrappedKey;
}

export interface ShareEpochKey {
  readonly category: ShareCategory;
  readonly epoch: number;
  readonly keyId: KeyId;
  /** Empty unless the category is `on` for that epoch (CR-01, CR-02). */
  readonly wrappedForDevices: readonly DeviceWrappedKey[];
}

/* ------------------------------------------------------------------------ */
/* Couple space (CPK)                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Per-kind couple entry fields. They hold only what an author writes into the
 * shared couple space; none references her private records, and love notes
 * have no health fields (CR-18).
 */
export interface CoupleEntryFieldsByKind {
  readonly date: { readonly text?: string };
  readonly sex: { readonly text?: string };
  readonly note: { readonly text: string };
  readonly love_note: { readonly text: string };
  /** The card she chose to send, as a preset or custom text (F-102). */
  readonly support_request: { readonly text: string };
  readonly checkin: { readonly text?: string };
}

export type CoupleEntry = {
  readonly [K in CoupleEntryKind]: {
    readonly id: CoupleEntryId;
    readonly authorDeviceId: DeviceId;
    readonly kind: K;
    readonly localDate: LocalDate;
    readonly fields: CoupleEntryFieldsByKind[K];
    readonly hlc: Hlc;
  };
}[CoupleEntryKind];

/** Her separate record allowing a couple entry to feed her insights (CR-13). */
export interface CoupleFlag {
  readonly entryId: CoupleEntryId;
  readonly allowInHerInsights: boolean;
}

/* ------------------------------------------------------------------------ */
/* Engine history, consent history, backup and sync bookkeeping              */
/* ------------------------------------------------------------------------ */

export interface PredictionSnapshot {
  readonly engineVersion: string;
  readonly paramsHash: string;
  readonly madeOn: LocalDate;
  readonly center: LocalDate;
  readonly lo: LocalDate;
  readonly hi: LocalDate;
  readonly actualStart?: LocalDate;
}

/** Her private consent history entry. There is no reason field (CR-04). */
export interface ConsentEvent {
  readonly at: LocalDateTime;
  readonly action: ConsentAction;
  readonly category?: ShareCategory;
}

export interface BackupMeta {
  readonly lastBackupAt?: LocalDateTime;
  readonly lastRestoreTestAt?: LocalDateTime;
  readonly recoveryCodeSetAt?: LocalDateTime;
}

/** Relay sequence-number cursors (never timestamps, PR-07). */
export interface SyncCursors {
  readonly slots: SeqCursor;
  readonly log: SeqCursor;
}

export interface SyncState {
  /** `null` while only the manual `file` transport is in use. */
  readonly relayUrl: string | null;
  readonly spaceId: SpaceId;
  readonly cursors: SyncCursors;
  /** HLC wall time (ms) before which tombstones may have been purged (≥180 days). */
  readonly tombstoneHorizon: number;
}

/* ------------------------------------------------------------------------ */
/* Entity registry                                                           */
/* ------------------------------------------------------------------------ */

/** Every entity of architecture.md §5.1, by name. */
export interface EntityMap {
  readonly DeviceIdentity: DeviceIdentity;
  readonly Profile: Profile;
  readonly DayBundle: DayBundle;
  readonly PeriodOverride: PeriodOverride;
  readonly ContraceptionState: ContraceptionState;
  readonly PregnancyRecord: PregnancyRecord;
  readonly ReminderRule: ReminderRule;
  readonly ShareSetting: ShareSetting;
  readonly ShareEpochKey: ShareEpochKey;
  readonly Projection: Projection;
  readonly CoupleEntry: CoupleEntry;
  readonly CoupleFlag: CoupleFlag;
  readonly PredictionSnapshot: PredictionSnapshot;
  readonly ConsentEvent: ConsentEvent;
  readonly BackupMeta: BackupMeta;
  readonly SyncState: SyncState;
}
export type EntityName = keyof EntityMap;
