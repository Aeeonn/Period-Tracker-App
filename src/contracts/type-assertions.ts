/**
 * Compile-time consistency checks for the contracts. Type-only: this module
 * emits no runtime code. `tsc --noEmit` fails if any check below is false.
 */
import type {
  BackupService,
  ContentIndex,
  CoupleRepo,
  CryptoApi,
  LocalDateApi,
  LockService,
  LogRepo,
  Migrations,
  PairingService,
  RecordStore,
  ReminderService,
  RunEngine,
  SettingsRepo,
  ShareService,
  SyncEngine,
  SyncTransport,
} from './index.ts';
import type { EntityMap, EntityName, TrackerValues } from './entities.ts';
import type {
  ChanceCategory,
  CyclePhase,
  SharedChanceCategory,
  SharedOverviewPhase,
  ShareCategory,
  Tracker,
  ZeroToThree,
} from './enums.ts';
import type { EngineOutput } from './engine-api.ts';
import type { PROJECTION_FIELDS, ProjectionPayloadByCategory } from './share.ts';
import type { ENTITY_NAMES, ENTITY_RECORD_TYPE } from './store.ts';
import type { MULTI_VALUE_TRACKERS, SUPPRESSION_CHANCE_CATEGORY } from './enums.ts';

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
type AllKeys<U> = U extends unknown ? keyof U : never;

/** Every §5.2 tracker has exactly one `TrackerValues` field. */
export type TrackerFieldsMatch = Expect<Equal<keyof TrackerValues, Tracker>>;

/** Multi-value trackers are stored as arrays. */
export type MultiTrackersAreArrays = Expect<
  TrackerValues[(typeof MULTI_VALUE_TRACKERS)[number]] extends readonly unknown[] ? true : false
>;

/** `energy` and `stress` are the 0–3 scale. */
export type EnergyStressScale = Expect<
  Equal<TrackerValues['energy'] | TrackerValues['stress'], ZeroToThree>
>;

/** `ENTITY_NAMES` lists every §5.1 entity exactly. */
export type EntityNamesMatch = Expect<Equal<(typeof ENTITY_NAMES)[number], EntityName>>;
export type EntityRecordTypesComplete = Expect<
  Equal<keyof typeof ENTITY_RECORD_TYPE, keyof EntityMap>
>;

/** The projection allowlist equals the payload type fields, per category (CR-08). */
export type ProjectionFieldsMatch = Expect<
  Equal<
    {
      [C in ShareCategory]: Equal<
        (typeof PROJECTION_FIELDS)[C][number],
        AllKeys<ProjectionPayloadByCategory[C]>
      >;
    }[ShareCategory],
    true
  >
>;

/** No projection field is named after a private-only tracker. */
export type NoRawTrackerFieldInProjections = Expect<
  Equal<
    Extract<
      AllKeys<ProjectionPayloadByCategory[ShareCategory]>,
      'notes' | 'sex' | 'tests' | 'bbt' | 'medication' | 'pill_intake' | 'desire' | 'flow'
    >,
    never
  >
>;

/** Shared subsets stay subsets. */
export type SharedChanceIsSubset = Expect<
  SharedChanceCategory extends ChanceCategory ? true : false
>;
export type SharedPhaseIsSubset = Expect<SharedOverviewPhase extends CyclePhase ? true : false>;
export type SharedPhaseHasNoFertileLabel = Expect<
  Equal<Extract<SharedOverviewPhase, 'fertile'>, never>
>;

/** Every suppression reason maps to a non-H/M/L category (A5, X11). */
export type SuppressionCategoriesComplete = Expect<
  Equal<
    Extract<
      (typeof SUPPRESSION_CHANCE_CATEGORY)[keyof typeof SUPPRESSION_CHANCE_CATEGORY],
      SharedChanceCategory
    >,
    never
  >
>;

/** `engineVersion` is the literal of algorithms-spec.md §0. */
export type EngineVersionLiteral = Expect<
  Equal<EngineOutput['engineVersion'], 'cycle-engine/1.0.0'>
>;

/** Every interface named in architecture.md §3 is exported from the index. */
export interface ArchitectureSection3Interfaces {
  readonly localdate: LocalDateApi;
  readonly crypto: CryptoApi;
  readonly data: RecordStore;
  readonly migrations: Migrations;
  readonly logRepo: LogRepo;
  readonly settingsRepo: SettingsRepo;
  readonly lock: LockService;
  readonly engine: RunEngine;
  readonly share: ShareService;
  readonly pairing: PairingService;
  readonly syncTransport: SyncTransport;
  readonly syncEngine: SyncEngine;
  readonly couple: CoupleRepo;
  readonly backup: BackupService;
  readonly reminders: ReminderService;
  readonly content: ContentIndex;
}
