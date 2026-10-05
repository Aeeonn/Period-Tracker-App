/**
 * Data-layer contracts (architecture.md §3 `data`, §4.5, §5.3, §6).
 * `RecordStore` encrypts every record body; only the coarse `RecordType`,
 * the opaque id, the HLC and the tombstone flag are plaintext.
 */
import type { Base64Url, DeviceId, LogicalId, OpaqueId } from './brand.ts';
import type { RecordType, Tracker } from './enums.ts';
import type {
  BackupMeta,
  ContraceptionState,
  DayBundle,
  DayShareSelection,
  DeviceIdentity,
  EntityMap,
  EntityName,
  Hlc,
  PeriodOverride,
  PregnancyRecord,
  Profile,
  ReminderRule,
  TrackerValues,
} from './entities.ts';
import type { LocalDate, LocalDateRange } from './localdate.ts';

/** Every entity name of architecture.md §5.1. */
export const ENTITY_NAMES = [
  'DeviceIdentity',
  'Profile',
  'DayBundle',
  'PeriodOverride',
  'ContraceptionState',
  'PregnancyRecord',
  'ReminderRule',
  'ShareSetting',
  'ShareEpochKey',
  'Projection',
  'CoupleEntry',
  'CoupleFlag',
  'PredictionSnapshot',
  'ConsentEvent',
  'BackupMeta',
  'SyncState',
] as const satisfies readonly EntityName[];

/** Coarse plaintext type each entity is stored under (architecture.md §6). */
export const ENTITY_RECORD_TYPE = {
  DeviceIdentity: 'sys',
  Profile: 'cfg',
  DayBundle: 'day',
  PeriodOverride: 'day',
  ContraceptionState: 'cfg',
  PregnancyRecord: 'cfg',
  ReminderRule: 'cfg',
  ShareSetting: 'share',
  ShareEpochKey: 'share',
  Projection: 'proj',
  CoupleEntry: 'couple',
  CoupleFlag: 'couple',
  PredictionSnapshot: 'sys',
  ConsentEvent: 'share',
  BackupMeta: 'sys',
  SyncState: 'sys',
} as const satisfies Record<EntityName, RecordType>;

/** Decrypted logical record (architecture.md §4.5 record shape). */
export type LogicalRecord<E extends EntityName = EntityName> = {
  readonly [K in E]: {
    readonly entity: K;
    readonly logicalId: LogicalId;
    /** Single writer per record. */
    readonly authorDevice: DeviceId;
    readonly hlc: Hlc;
  } & (
    | { readonly deleted: false; readonly body: EntityMap[K] }
    /** Tombstone, kept at least 180 days. */
    | { readonly deleted: true }
  );
}[E];

/** Row of the IndexedDB `records` store (architecture.md §6). */
export interface StoredRecordRow {
  readonly id: OpaqueId;
  readonly type: RecordType;
  readonly hlc: Hlc;
  readonly deleted: boolean;
  readonly iv: Base64Url;
  readonly ct: Base64Url;
}

/** Operations available inside one atomic transaction. */
export interface RecordTransaction {
  get<E extends EntityName>(entity: E, logicalId: LogicalId): Promise<LogicalRecord<E> | undefined>;
  put<E extends EntityName>(record: LogicalRecord<E>): Promise<void>;
  /** Writes a tombstone with the given HLC; never a silent hard delete. */
  delete(entity: EntityName, logicalId: LogicalId, hlc: Hlc): Promise<void>;
  list<E extends EntityName>(
    entity: E,
    options?: { readonly includeDeleted?: boolean },
  ): Promise<readonly LogicalRecord<E>[]>;
}

export interface RecordStore extends RecordTransaction {
  /** Runs `work` atomically; any rejection aborts every write in it. */
  transaction<R>(work: (tx: RecordTransaction) => Promise<R>): Promise<R>;
}

/* ------------------------------------------------------------------------ */
/* Migrations (architecture.md §5.3)                                          */
/* ------------------------------------------------------------------------ */

/** Pure vN → vN+1 migration over decrypted records. */
export interface Migration {
  readonly from: number;
  readonly to: number;
  migrate(records: readonly LogicalRecord[]): readonly LogicalRecord[];
}

export type MigrationOutcome =
  | { readonly status: 'up_to_date'; readonly schemaVersion: number }
  | { readonly status: 'migrated'; readonly from: number; readonly to: number }
  /** The pre-migration snapshot is kept; the UI offers restore and export. */
  | { readonly status: 'failed'; readonly from: number; readonly snapshotKept: true }
  /** Stored schema is newer than the code: open read-only, never write. */
  | { readonly status: 'read_only_newer_schema'; readonly stored: number; readonly code: number };

export interface Migrations {
  /** Ordered, contiguous list ending at the code's schema version. */
  readonly steps: readonly Migration[];
  readonly schemaVersion: number;
  /** Writes the pre-migration snapshot first, then runs pending steps. */
  run(): Promise<MigrationOutcome>;
}

/* ------------------------------------------------------------------------ */
/* Repositories                                                              */
/* ------------------------------------------------------------------------ */

export type Unsubscribe = () => void;

export interface LogChange {
  readonly localDates: readonly LocalDate[];
}

export interface LogRepo {
  getDay(localDate: LocalDate): Promise<DayBundle | undefined>;
  listDays(range: LocalDateRange): Promise<readonly DayBundle[]>;
  setTracker<T extends Tracker>(
    localDate: LocalDate,
    tracker: T,
    value: TrackerValues[T],
  ): Promise<void>;
  /** Clears one tracker, keeping a field tombstone with its HLC. */
  clearTracker(localDate: LocalDate, tracker: Tracker): Promise<void>;
  /** Per-entry share opt-in for one day (CR-12). */
  setShareSelection(localDate: LocalDate, selection: DayShareSelection): Promise<void>;
  listOverrides(): Promise<readonly PeriodOverride[]>;
  putOverride(override: PeriodOverride): Promise<void>;
  removeOverride(override: PeriodOverride): Promise<void>;
  /** Change events for the engine worker. */
  onChange(listener: (change: LogChange) => void): Unsubscribe;
}

export interface SettingsRepo {
  getProfile(): Promise<Profile | undefined>;
  putProfile(profile: Profile): Promise<void>;
  listContraception(): Promise<readonly ContraceptionState[]>;
  putContraception(state: ContraceptionState): Promise<void>;
  listPregnancies(): Promise<readonly PregnancyRecord[]>;
  putPregnancy(record: PregnancyRecord): Promise<void>;
  listReminders(): Promise<readonly ReminderRule[]>;
  putReminder(rule: ReminderRule): Promise<void>;
  getBackupMeta(): Promise<BackupMeta>;
  getDeviceIdentity(): Promise<DeviceIdentity | undefined>;
}
