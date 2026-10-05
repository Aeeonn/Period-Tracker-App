/**
 * Nominal ("branded") type helper. Brands exist only at compile time; the
 * runtime value is the plain underlying primitive. A branded value can only be
 * produced by the module that owns its validation (for example `lib/localdate`
 * for `LocalDate`), never by a bare cast in feature code.
 */
declare const brandSymbol: unique symbol;

export type Brand<Base, Name extends string> = Base & { readonly [brandSymbol]: Name };

/** Opaque, randomly generated device identifier (architecture.md §4.1). */
export type DeviceId = Brand<string, 'DeviceId'>;
/** Opaque relay space identifier (architecture.md §4.1). */
export type SpaceId = Brand<string, 'SpaceId'>;
/** Single-use pairing session identifier (architecture.md §4.2). */
export type PairingSessionId = Brand<string, 'PairingSessionId'>;
/** Logical record id. Only ever stored inside ciphertext (architecture.md §6). */
export type LogicalId = Brand<string, 'LogicalId'>;
/** HMAC-SHA256(indexKey, logicalId), base64url, 128 bits (architecture.md §6). */
export type OpaqueId = Brand<string, 'OpaqueId'>;
/** Opaque relay slot id with no per-category meaning (security-privacy.md PR-07). */
export type SlotId = Brand<string, 'SlotId'>;
/** Opaque key identifier for a wrapped key (architecture.md §5.1 ShareEpochKey). */
export type KeyId = Brand<string, 'KeyId'>;
/** Identifier of a couple entry (architecture.md §5.1 CoupleEntry). */
export type CoupleEntryId = Brand<string, 'CoupleEntryId'>;
/** Identifier of a pregnancy record (architecture.md §5.1 PregnancyRecord). */
export type PregnancyId = Brand<string, 'PregnancyId'>;
/** Identifier of a reminder rule (architecture.md §5.1 ReminderRule). */
export type ReminderId = Brand<string, 'ReminderId'>;
/** Identifier of an original content card (algorithms-spec.md A17). */
export type ContentCardId = Brand<string, 'ContentCardId'>;
/** Unpadded base64url text, used for every serialized byte string. */
export type Base64Url = Brand<string, 'Base64Url'>;
/** Monotonic relay sequence number used as a cursor; never a timestamp (PR-07). */
export type SeqCursor = Brand<number, 'SeqCursor'>;

/** Raw bytes passed to and from Web Crypto. */
export type Bytes = Uint8Array<ArrayBuffer>;
