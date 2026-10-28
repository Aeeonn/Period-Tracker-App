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
import type { MULTI_VALUE_TRACKERS, RecordType, SUPPRESSION_CHANCE_CATEGORY } from './enums.ts';
import type {
  ChangePassphraseResult,
  ConfirmSetupResult,
  LockReason,
  LockSetupResult,
  LockSetupState,
  RecoveryConfirmation,
  RecoveryConfirmPositions,
  StoreKeysResult,
  UnlockedStoreKeys,
  UnlockResult,
  UnlockSecret,
} from './lock.ts';
import type {
  LogicalRecord,
  RecordKeyMaterial,
  RecordKeyProvider,
  StoredRecordRow,
  Unsubscribe,
} from './store.ts';
import type { Bytes } from './brand.ts';

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

/* Lock key lifecycle (ADR-0010). */

type Returned<T> = T extends (...args: never[]) => infer R ? Awaited<R> : T;
type Signature<F> = F extends (...args: infer A) => infer R ? [A, R] : never;
type LockServiceOutputs = { [K in keyof LockService]: Returned<LockService[K]> }[keyof LockService];
type MemberValues<U> = U extends object ? U[keyof U] : never;
type RawBytes = ArrayBufferLike | ArrayBufferView;

/**
 * Exact shapes of every result, secret, key and callback type that the
 * `LockService` signatures below name, so redefining one of them (an added
 * field, branch or kind, or a removed one) fails typecheck.
 */
export type UnlockSecretShape = Expect<
  Equal<
    UnlockSecret,
    | { readonly kind: 'passphrase'; readonly passphrase: string }
    | { readonly kind: 'recovery_code'; readonly code: string }
    | { readonly kind: 'passkey_prf'; readonly prfOutput: Bytes }
  >
>;
export type UnlockResultShape = Expect<
  Equal<
    UnlockResult,
    { readonly ok: true } | { readonly ok: false; readonly error: 'wrong_secret' | 'unsupported' }
  >
>;
export type LockReasonShape = Expect<
  Equal<LockReason, 'manual' | 'quick_hide' | 'timeout' | 'cold_start'>
>;
export type LockSetupStateShape = Expect<
  Equal<LockSetupState, 'not_configured' | 'pending_confirmation' | 'configured'>
>;
export type RecoveryConfirmShapes = Expect<
  Equal<
    [RecoveryConfirmPositions, RecoveryConfirmation],
    [readonly [number, number, number, number], readonly [string, string, string, string]]
  >
>;
export type LockSetupResultShape = Expect<
  Equal<
    LockSetupResult,
    { readonly recoveryCode: string; readonly confirmPositions: RecoveryConfirmPositions }
  >
>;
export type ConfirmSetupResultShape = Expect<
  Equal<
    ConfirmSetupResult,
    | { readonly ok: true }
    | { readonly ok: false; readonly error: 'wrong_confirmation' }
    | { readonly ok: false; readonly error: 'no_pending_setup' }
  >
>;
export type ChangePassphraseResultShape = Expect<
  Equal<
    ChangePassphraseResult,
    | { readonly ok: true }
    | { readonly ok: false; readonly error: 'locked' }
    | { readonly ok: false; readonly error: 'wrong_secret' }
  >
>;
export type StoreKeysResultShape = Expect<
  Equal<
    StoreKeysResult,
    | { readonly ok: true; readonly keys: UnlockedStoreKeys }
    | { readonly ok: false; readonly error: 'locked' }
  >
>;
export type UnlockedStoreKeysShape = Expect<
  Equal<
    UnlockedStoreKeys,
    {
      readonly indexKey: CryptoKey;
      readonly keyProvider: RecordKeyProvider;
      isValid(): boolean;
    }
  >
>;
export type RecordKeyShapes = Expect<
  Equal<
    [RecordKeyProvider, RecordKeyMaterial],
    [
      {
        readonly snapshotKey: CryptoKey;
        forWrite(record: LogicalRecord): RecordKeyMaterial | Promise<RecordKeyMaterial>;
        forRead(
          type: RecordType,
          row: StoredRecordRow,
        ): readonly RecordKeyMaterial[] | Promise<readonly RecordKeyMaterial[]>;
      },
      { readonly key: CryptoKey; readonly epoch: number },
    ]
  >
>;
export type UnsubscribeShape = Expect<Equal<Unsubscribe, () => void>>;

/** `LockService` has exactly these members, so none can be removed or added unnoticed. */
export type LockServiceMembersExact = Expect<
  Equal<
    keyof LockService,
    | 'setup'
    | 'confirmSetup'
    | 'cancelSetup'
    | 'setupState'
    | 'unlock'
    | 'lock'
    | 'isUnlocked'
    | 'onLock'
    | 'changePassphrase'
    | 'storeKeys'
  >
>;

/** Every member keeps its exact parameters and result, so no locked branch or input can be dropped. */
export type LockServiceSignatures = Expect<
  Equal<
    { [K in keyof LockService]: Signature<LockService[K]> },
    {
      setup: [[string], Promise<LockSetupResult>];
      confirmSetup: [[RecoveryConfirmation], Promise<ConfirmSetupResult>];
      cancelSetup: [[], void];
      setupState: [[], Promise<LockSetupState>];
      unlock: [[UnlockSecret], Promise<UnlockResult>];
      lock: [[LockReason], void];
      isUnlocked: [[], boolean];
      onLock: [[(reason: LockReason) => void], Unsubscribe];
      changePassphrase: [[UnlockSecret, string], Promise<ChangePassphraseResult>];
      storeKeys: [[], StoreKeysResult];
    }
  >
>;

/**
 * Every member is a function with exactly one call signature, and is neither
 * optional nor nullable. `infer` above sees only the last overload, so an
 * overload added in front of a signature would escape it; a non-function
 * part of a member (`undefined`, `null` or a value) maps to `false`.
 */
type SingleSignature<F> = F extends (...args: infer A) => infer R
  ? Equal<F, (...args: A) => R>
  : false;
export type LockServiceNoOverloads = Expect<
  Equal<{ [K in keyof LockService]: SingleSignature<LockService[K]> }[keyof LockService], true>
>;

/** The pre-ADR-0010 members keep their signatures (additive change, `CONTRACTS_VERSION` 1). */
export type LockServiceV1MembersKept = Expect<
  Equal<
    [
      Parameters<LockService['setup']>[0],
      Returned<LockService['setup']>['recoveryCode'],
      Parameters<LockService['unlock']>[0],
      Returned<LockService['unlock']>,
      Parameters<LockService['lock']>[0],
      Returned<LockService['isUnlocked']>,
      Parameters<LockService['onLock']>[0],
      Returned<LockService['onLock']>,
    ],
    [
      string,
      string,
      UnlockSecret,
      UnlockResult,
      LockReason,
      boolean,
      (reason: LockReason) => void,
      Unsubscribe,
    ]
  >
>;

/**
 * A locked service cannot yield keys: `storeKeys` returns `StoreKeysResult`,
 * whose only key-carrying branch is `ok: true`.
 */
export type StoreKeysReturnsResult = Expect<
  Equal<ReturnType<LockService['storeKeys']>, StoreKeysResult>
>;
export type LockedStoreKeysCarryNoKeys = Expect<
  Equal<
    Extract<StoreKeysResult, { readonly keys: unknown }>,
    Extract<StoreKeysResult, { readonly ok: true }>
  >
>;
export type LockedStoreKeysError = Expect<
  Equal<
    Extract<StoreKeysResult, { readonly ok: false }>,
    { readonly ok: false; readonly error: 'locked' }
  >
>;

/** The hand-off exposes the index key, the record-key provider and validity, never the LMK. */
export type StoreKeysMembersExact = Expect<
  Equal<keyof UnlockedStoreKeys, 'indexKey' | 'keyProvider' | 'isValid'>
>;
export type StoreKeyProviderIsStoreContract = Expect<
  Equal<UnlockedStoreKeys['keyProvider'], RecordKeyProvider>
>;

/** No `LockService` output, result field or handed-out key member is a byte buffer. */
export type LockServiceReturnsNoRawBytes = Expect<
  Equal<
    Extract<
      | LockServiceOutputs
      | MemberValues<LockServiceOutputs>
      | MemberValues<UnlockedStoreKeys>
      | MemberValues<RecordKeyProvider>,
      RawBytes
    >,
    never
  >
>;

/** Setup confirmation asks for exactly the four service-chosen characters. */
export type RecoveryConfirmationMatchesPositions = Expect<
  Equal<[RecoveryConfirmation['length'], LockSetupResult['confirmPositions']['length']], [4, 4]>
>;
export type ConfirmSetupErrors = Expect<
  Equal<
    Extract<ConfirmSetupResult, { readonly ok: false }>['error'],
    'wrong_confirmation' | 'no_pending_setup'
  >
>;

/** Passphrase change re-authenticates with one unlock secret (captain decision D1). */
export type ChangePassphraseRequiresUnlockSecret = Expect<
  Equal<Parameters<LockService['changePassphrase']>, [UnlockSecret, string]>
>;
export type ChangePassphraseErrors = Expect<
  Equal<Extract<ChangePassphraseResult, { readonly ok: false }>['error'], 'locked' | 'wrong_secret'>
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
