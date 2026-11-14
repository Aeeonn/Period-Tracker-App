import type { Base64Url, Bytes } from '../../contracts/brand.ts';
import type { PasskeyEnrollment, PasskeyInfo } from '../../contracts/lock.ts';
import { decodeBase64Url, encodeBase64Url } from '../../crypto/primitives/encoding.ts';
import { randomBytes } from '../../crypto/primitives/webcrypto.ts';

/** Why a Face ID ceremony produced no PRF output. No raw browser error is kept. */
export type PasskeyCeremonyError = 'cancelled' | 'unsupported' | 'failed';

export type PasskeyCeremonyResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PasskeyCeremonyError };

/**
 * The WebAuthn side of Face ID unlock (security-privacy.md §3, SR-03). It never
 * sees the LMK: it only creates a passkey and evaluates its PRF.
 */
export interface PasskeyAuthenticator {
  /** A user-verifying platform authenticator (Face ID, Touch ID or passcode) is available. */
  isAvailable(): Promise<boolean>;
  /** Creates a passkey for this site and returns its PRF output for a new random salt. */
  enroll(): Promise<PasskeyCeremonyResult<PasskeyEnrollment>>;
  /** Asks for the stored passkey and returns its 32-byte PRF output. */
  evaluate(info: PasskeyInfo): Promise<PasskeyCeremonyResult<Bytes>>;
  /** Best effort: asks the platform to forget a passkey Flo no longer uses. Never throws. */
  forget(credentialId: Base64Url): Promise<void>;
}

interface PrfExtensionOutput {
  readonly prf?: { readonly enabled?: boolean; readonly results?: { readonly first?: unknown } };
}

interface PublicKeyCredentialLike {
  readonly type: string;
  readonly rawId: ArrayBuffer;
  getClientExtensionResults(): PrfExtensionOutput;
}

interface PublicKeyCredentialStatics {
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
}

export interface WebAuthnEnvironment {
  readonly isSecureContext: boolean;
  readonly hostname: string;
  readonly credentials: Pick<CredentialsContainer, 'create' | 'get'> | undefined;
  readonly publicKeyCredential: PublicKeyCredentialStatics | undefined;
}

const PRF_BYTES = 32;
const CEREMONY_TIMEOUT_MS = 60_000;

function browserEnvironment(): WebAuthnEnvironment {
  const scope = globalThis as typeof globalThis & {
    PublicKeyCredential?: PublicKeyCredentialStatics;
  };
  return {
    isSecureContext: scope.isSecureContext === true,
    hostname: scope.location?.hostname ?? '',
    credentials: scope.navigator?.credentials,
    publicKeyCredential: scope.PublicKeyCredential,
  };
}

function isCredential(value: unknown): value is PublicKeyCredentialLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PublicKeyCredentialLike>;
  return (
    candidate.type === 'public-key' &&
    candidate.rawId instanceof ArrayBuffer &&
    typeof candidate.getClientExtensionResults === 'function'
  );
}

function prfOutput(credential: PublicKeyCredentialLike): Bytes | null {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  let bytes: Bytes | null = null;
  if (first instanceof ArrayBuffer) {
    bytes = new Uint8Array(first.slice(0));
  } else if (ArrayBuffer.isView(first)) {
    bytes = new Uint8Array(first.byteLength);
    bytes.set(new Uint8Array(first.buffer, first.byteOffset, first.byteLength));
  }
  if (bytes === null) return null;
  if (bytes.length !== PRF_BYTES) {
    bytes.fill(0);
    return null;
  }
  return bytes;
}

function ceremonyError(error: unknown): PasskeyCeremonyError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'unsupported';
  return 'failed';
}

export function createPasskeyAuthenticator(
  environment: () => WebAuthnEnvironment = browserEnvironment,
): PasskeyAuthenticator {
  const usable = (
    env: WebAuthnEnvironment,
  ): env is WebAuthnEnvironment & {
    readonly credentials: Pick<CredentialsContainer, 'create' | 'get'>;
  } =>
    env.isSecureContext &&
    env.hostname !== '' &&
    env.publicKeyCredential !== undefined &&
    typeof env.credentials?.create === 'function' &&
    typeof env.credentials.get === 'function';

  const evaluateCredential = async (
    credentials: Pick<CredentialsContainer, 'get'>,
    rpId: string,
    credentialId: Bytes,
    prfSalt: Bytes,
  ): Promise<PasskeyCeremonyResult<Bytes>> => {
    const assertion = await credentials.get({
      publicKey: {
        rpId,
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        timeout: CEREMONY_TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
      },
    });
    if (!isCredential(assertion)) return { ok: false, error: 'failed' };
    const output = prfOutput(assertion);
    return output ? { ok: true, value: output } : { ok: false, error: 'unsupported' };
  };

  return {
    async isAvailable() {
      const env = environment();
      if (!usable(env)) return false;
      try {
        const check = env.publicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
        return typeof check === 'function' ? await check.call(env.publicKeyCredential) : false;
      } catch {
        return false;
      }
    },

    async enroll() {
      const env = environment();
      if (!usable(env)) return { ok: false, error: 'unsupported' };
      const prfSalt = randomBytes(PRF_BYTES);
      try {
        const created = await env.credentials.create({
          publicKey: {
            rp: { id: env.hostname, name: 'Flo' },
            user: { id: randomBytes(16), name: 'Flo unlock', displayName: 'Flo unlock' },
            challenge: randomBytes(32),
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              residentKey: 'required',
              userVerification: 'required',
            },
            attestation: 'none',
            timeout: CEREMONY_TIMEOUT_MS,
            extensions: {
              prf: { eval: { first: prfSalt } },
            } as AuthenticationExtensionsClientInputs,
          },
        });
        if (!isCredential(created)) return { ok: false, error: 'failed' };
        const credentialId = new Uint8Array(created.rawId.slice(0));
        const discard = async (error: PasskeyCeremonyError) => {
          await forgetCredential(env, encodeBase64Url(credentialId));
          return { ok: false, error } as const;
        };
        if (created.getClientExtensionResults().prf?.enabled === false) {
          return await discard('unsupported');
        }
        let output = prfOutput(created);
        if (output === null) {
          let evaluated: PasskeyCeremonyResult<Bytes>;
          try {
            evaluated = await evaluateCredential(
              env.credentials,
              env.hostname,
              credentialId,
              prfSalt,
            );
          } catch (error) {
            return await discard(ceremonyError(error));
          }
          if (!evaluated.ok) return await discard(evaluated.error);
          output = evaluated.value;
        }
        return {
          ok: true,
          value: {
            credentialId: encodeBase64Url(credentialId),
            prfSalt: encodeBase64Url(prfSalt),
            prfOutput: output,
          },
        };
      } catch (error) {
        return { ok: false, error: ceremonyError(error) };
      }
    },

    async evaluate(info) {
      const env = environment();
      if (!usable(env)) return { ok: false, error: 'unsupported' };
      let credentialId: Bytes;
      let prfSalt: Bytes;
      try {
        credentialId = decodeBase64Url(info.credentialId);
        prfSalt = decodeBase64Url(info.prfSalt);
      } catch {
        return { ok: false, error: 'failed' };
      }
      try {
        return await evaluateCredential(env.credentials, env.hostname, credentialId, prfSalt);
      } catch (error) {
        return { ok: false, error: ceremonyError(error) };
      }
    },

    async forget(credentialId) {
      await forgetCredential(environment(), credentialId);
    },
  };
}

async function forgetCredential(env: WebAuthnEnvironment, credentialId: Base64Url): Promise<void> {
  const signal = env.publicKeyCredential?.signalUnknownCredential;
  if (typeof signal !== 'function' || env.hostname === '') return;
  try {
    await signal.call(env.publicKeyCredential, { rpId: env.hostname, credentialId });
  } catch {
    // The platform may keep the unused passkey; it cannot unlock anything without the wrap.
  }
}
