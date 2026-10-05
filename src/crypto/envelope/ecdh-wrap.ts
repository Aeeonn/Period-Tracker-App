import type { Bytes, DeviceId } from '../../contracts/brand.ts';
import type { EcdhRecipient, EcdhWrappedKey, WrapContext } from '../../contracts/crypto.ts';
import { SHARE_CATEGORIES } from '../../contracts/enums.ts';
import { decodeBase64Url, encodeBase64Url, encodeTuple, utf8 } from '../primitives/encoding.ts';
import { deriveHkdfAes256 } from '../primitives/hkdf.ts';
import { getWebCrypto, randomBytes } from '../primitives/webcrypto.ts';
import { AES_GCM_IV_BYTES, AES_GCM_TAG_BITS } from './aes-gcm.ts';
import { sign, verify } from './signatures.ts';

const ECDH_SALT_BYTES = 16;

function contextFields(context: WrapContext): readonly (string | number)[] {
  if (!Number.isSafeInteger(context.epoch) || context.epoch < 0) {
    throw new TypeError('Wrap epoch must be a non-negative safe integer');
  }
  if (context.kind === 'category') {
    if (!(SHARE_CATEGORIES as readonly string[]).includes(context.category)) {
      throw new TypeError('Invalid share category');
    }
    return ['category', context.category, context.epoch];
  }
  if (context.kind === 'couple') return ['couple', context.epoch];
  throw new TypeError('Invalid ECDH wrap context');
}

function hkdfInfo(context: WrapContext, recipientDeviceId: DeviceId): Bytes {
  const purpose = context.kind === 'couple' ? 'couple' : context.category;
  return utf8(`wrap/v1|${purpose}|${context.epoch}|${recipientDeviceId}`);
}

function signatureData(wrapped: Omit<EcdhWrappedKey, 'signature'>): Bytes {
  const fields = contextFields(wrapped.context);
  return encodeTuple([
    'ecdh-wrap/v1',
    wrapped.recipientDeviceId,
    ...fields,
    wrapped.ephemeralPub,
    wrapped.salt,
    wrapped.iv,
    wrapped.ct,
  ]);
}

function assertAesKey(key: CryptoKey): void {
  const algorithm = key.algorithm as AesKeyAlgorithm;
  if (
    key.type !== 'secret' ||
    algorithm.name !== 'AES-GCM' ||
    algorithm.length !== 256 ||
    !key.extractable
  ) {
    throw new TypeError('ECDH-ES wrapping requires an extractable AES-256-GCM key');
  }
}

function assertAgreementKey(key: CryptoKey, type: 'public' | 'private'): void {
  if (
    key.type !== type ||
    key.algorithm.name !== 'ECDH' ||
    (key.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256'
  ) {
    throw new TypeError(`Expected an ECDH P-256 ${type} key`);
  }
}

async function deriveWrapKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Bytes,
  info: Bytes,
): Promise<CryptoKey> {
  const shared = new Uint8Array(
    await getWebCrypto().subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256),
  );
  return deriveHkdfAes256(shared, salt, info);
}

export async function ecdhWrap(
  key: CryptoKey,
  recipient: EcdhRecipient,
  context: WrapContext,
  senderSignKey: CryptoKey,
): Promise<EcdhWrappedKey> {
  assertAesKey(key);
  assertAgreementKey(recipient.agreePub, 'public');
  const encodedContext = contextFields(context);
  const crypto = getWebCrypto();
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
  const ephemeralPub = new Uint8Array(await crypto.subtle.exportKey('spki', ephemeral.publicKey));
  const salt = randomBytes(ECDH_SALT_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const wrapKek = await deriveWrapKey(
    ephemeral.privateKey,
    recipient.agreePub,
    salt,
    hkdfInfo(context, recipient.deviceId),
  );
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
      wrapKek,
      keyBytes,
    ),
  );
  const unsigned: Omit<EcdhWrappedKey, 'signature'> = {
    recipientDeviceId: recipient.deviceId,
    context:
      context.kind === 'couple'
        ? { kind: 'couple', epoch: context.epoch }
        : { kind: 'category', category: context.category, epoch: context.epoch },
    ephemeralPub: encodeBase64Url(ephemeralPub),
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    ct: encodeBase64Url(ct),
  };
  // `encodedContext` is evaluated above to validate the discriminated context at runtime.
  void encodedContext;
  const signature = await sign(senderSignKey, signatureData(unsigned));
  return { ...unsigned, signature };
}

export async function ecdhUnwrap(
  wrapped: EcdhWrappedKey,
  recipientAgreeKey: CryptoKey,
  senderSignPub: CryptoKey,
): Promise<
  | { readonly ok: true; readonly value: CryptoKey }
  | { readonly ok: false; readonly error: { readonly kind: 'bad_signature' | 'integrity' } }
> {
  try {
    assertAgreementKey(recipientAgreeKey, 'private');
    contextFields(wrapped.context);
    const unsigned: Omit<EcdhWrappedKey, 'signature'> = {
      recipientDeviceId: wrapped.recipientDeviceId,
      context: wrapped.context,
      ephemeralPub: wrapped.ephemeralPub,
      salt: wrapped.salt,
      iv: wrapped.iv,
      ct: wrapped.ct,
    };
    const isValid = await verify(senderSignPub, signatureData(unsigned), wrapped.signature);
    if (!isValid) return { ok: false, error: { kind: 'bad_signature' } };

    const ephemeralBytes = decodeBase64Url(wrapped.ephemeralPub);
    const salt = decodeBase64Url(wrapped.salt);
    const iv = decodeBase64Url(wrapped.iv);
    const ciphertext = decodeBase64Url(wrapped.ct);
    if (
      salt.length !== ECDH_SALT_BYTES ||
      iv.length !== AES_GCM_IV_BYTES ||
      ciphertext.length < AES_GCM_TAG_BITS / 8
    ) {
      return { ok: false, error: { kind: 'integrity' } };
    }
    const ephemeralPub = await getWebCrypto().subtle.importKey(
      'spki',
      ephemeralBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const wrapKek = await deriveWrapKey(
      recipientAgreeKey,
      ephemeralPub,
      salt,
      hkdfInfo(wrapped.context, wrapped.recipientDeviceId),
    );
    const plaintext = new Uint8Array(
      await getWebCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
        wrapKek,
        ciphertext,
      ),
    );
    if (plaintext.length !== 32) return { ok: false, error: { kind: 'integrity' } };
    // The recipient immediately re-wraps this share key under their LMK (architecture §3).
    const key = await getWebCrypto().subtle.importKey(
      'raw',
      plaintext,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    return { ok: true, value: key };
  } catch {
    return { ok: false, error: { kind: 'integrity' } };
  }
}
