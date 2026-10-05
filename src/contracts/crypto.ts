/**
 * `CryptoApi` (architecture.md §3; security-privacy.md §3). Web Crypto only:
 * AES-256-GCM, HKDF-SHA-256, PBKDF2-HMAC-SHA-256 (600,000 iterations,
 * 16-byte salt), ECDH P-256, ECDSA P-256/SHA-256, HMAC-SHA-256.
 *
 * Serialization rule: every byte string that is stored or transmitted is
 * `Base64Url`; plaintext crossing this API is `Bytes`.
 */
import type { Base64Url, Bytes, DeviceId, LogicalId, OpaqueId } from './brand.ts';
import type { RecordType, ShareCategory } from './enums.ts';

/** PBKDF2 parameters; iterations are never below 600,000 (security-privacy.md §3). */
export interface Pbkdf2Params {
  readonly iterations: number;
  /** 16 bytes. */
  readonly salt: Bytes;
}

/** Secret material from which a key-encryption key (KEK) is derived. */
export type KekSource =
  | { readonly kind: 'passphrase'; readonly passphrase: string; readonly params: Pbkdf2Params }
  | { readonly kind: 'recovery_code'; readonly code: string; readonly salt: Bytes }
  | { readonly kind: 'passkey_prf'; readonly prfOutput: Bytes; readonly salt: Bytes };

/** Typed failures. Failures never return partial plaintext. */
export type CryptoError =
  | { readonly kind: 'wrong_secret' }
  | { readonly kind: 'integrity' }
  | { readonly kind: 'bad_signature' }
  | { readonly kind: 'unsupported' };

export type CryptoResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CryptoError };

/** Associated data bound into every AES-GCM envelope (security-privacy.md §3). */
export interface EnvelopeAad {
  readonly recordId: OpaqueId;
  readonly type: RecordType;
  readonly schemaVersion: number;
  readonly epoch: number;
}

/** AES-GCM output with a fresh random 96-bit IV. */
export interface SealedBox {
  readonly iv: Base64Url;
  readonly ct: Base64Url;
}

/** A symmetric key wrapped under a KEK with AES-GCM. */
export interface WrappedKey {
  readonly iv: Base64Url;
  readonly ct: Base64Url;
}

/** What a key wrapped for another device is for (HKDF info "wrap/v1|…"). */
export type WrapContext =
  | { readonly kind: 'category'; readonly category: ShareCategory; readonly epoch: number }
  | { readonly kind: 'couple'; readonly epoch: number };

/**
 * A key wrapped to a recipient device with ECDH-ES + HKDF, signed by the
 * sender. Its `context` names a category, so it travels to the relay only
 * inside a sealed envelope, never as plaintext metadata (PR-07).
 */
export interface EcdhWrappedKey {
  readonly recipientDeviceId: DeviceId;
  readonly context: WrapContext;
  /** Ephemeral ECDH P-256 public key, SPKI encoded. */
  readonly ephemeralPub: Base64Url;
  readonly salt: Base64Url;
  readonly iv: Base64Url;
  readonly ct: Base64Url;
  /** Sender device ECDSA signature over all fields above. */
  readonly signature: Base64Url;
}

export interface EcdhRecipient {
  readonly deviceId: DeviceId;
  readonly agreePub: CryptoKey;
}

/** Intended use of an unwrapped key. */
export type KeyPurpose = 'aes_gcm' | 'hmac' | 'ecdsa_sign';

export interface CryptoApi {
  deriveKek(source: KekSource): Promise<CryptoKey>;
  wrapKey(key: CryptoKey, kek: CryptoKey): Promise<WrappedKey>;
  /** Returns `wrong_secret` when the KEK does not match. */
  unwrapKey(
    wrapped: WrappedKey,
    kek: CryptoKey,
    purpose: KeyPurpose,
  ): Promise<CryptoResult<CryptoKey>>;
  seal(key: CryptoKey, plaintext: Bytes, aad: EnvelopeAad): Promise<SealedBox>;
  /** Fails with `integrity` if any ciphertext byte or AAD field changed. */
  open(key: CryptoKey, box: SealedBox, aad: EnvelopeAad): Promise<CryptoResult<Bytes>>;
  sign(privateKey: CryptoKey, data: Bytes): Promise<Base64Url>;
  verify(publicKey: CryptoKey, data: Bytes, signature: Base64Url): Promise<boolean>;
  ecdhWrap(
    key: CryptoKey,
    recipient: EcdhRecipient,
    context: WrapContext,
    senderSignKey: CryptoKey,
  ): Promise<EcdhWrappedKey>;
  /** Verifies the sender signature before unwrapping. */
  ecdhUnwrap(
    wrapped: EcdhWrappedKey,
    recipientAgreeKey: CryptoKey,
    senderSignPub: CryptoKey,
  ): Promise<CryptoResult<CryptoKey>>;
  /** HMAC-SHA-256 opaque id, base64url, 128 bits (architecture.md §6). */
  opaqueId(indexKey: CryptoKey, logicalId: LogicalId): Promise<OpaqueId>;
}
