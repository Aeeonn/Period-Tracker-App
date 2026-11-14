import { describe, expect, it, vi } from 'vitest';
import type { Base64Url } from '../../src/contracts/brand.ts';
import { encodeBase64Url } from '../../src/crypto/primitives/encoding.ts';
import {
  createPasskeyAuthenticator,
  type WebAuthnEnvironment,
} from '../../src/lock/passkey/index.ts';

const RAW_ID = new Uint8Array(16).fill(5);
const SYNTHETIC_HOST = 'synthetic.flo.test';

function credential(prf: unknown) {
  return {
    type: 'public-key',
    rawId: RAW_ID.slice().buffer,
    getClientExtensionResults: () => prf,
  };
}

function prfResult(byte: number, length = 32) {
  return { prf: { enabled: true, results: { first: new Uint8Array(length).fill(byte).buffer } } };
}

function environment(overrides: Partial<WebAuthnEnvironment> = {}) {
  const create = vi.fn<(options?: CredentialCreationOptions) => Promise<unknown>>();
  const get = vi.fn<(options?: CredentialRequestOptions) => Promise<unknown>>();
  const signalUnknownCredential = vi.fn(async () => undefined);
  const env: WebAuthnEnvironment = {
    isSecureContext: true,
    hostname: SYNTHETIC_HOST,
    credentials: { create, get } as unknown as Pick<CredentialsContainer, 'create' | 'get'>,
    publicKeyCredential: {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
      signalUnknownCredential,
    },
    ...overrides,
  };
  return { env, create, get, signalUnknownCredential };
}

describe('createPasskeyAuthenticator', () => {
  it('reports availability only in a secure context with a platform authenticator', async () => {
    expect(await createPasskeyAuthenticator(() => environment().env).isAvailable()).toBe(true);
    expect(
      await createPasskeyAuthenticator(
        () => environment({ isSecureContext: false }).env,
      ).isAvailable(),
    ).toBe(false);
    expect(
      await createPasskeyAuthenticator(
        () => environment({ publicKeyCredential: undefined }).env,
      ).isAvailable(),
    ).toBe(false);
    expect(
      await createPasskeyAuthenticator(
        () =>
          environment({
            publicKeyCredential: {
              isUserVerifyingPlatformAuthenticatorAvailable: async () => {
                throw new Error('synthetic');
              },
            },
          }).env,
      ).isAvailable(),
    ).toBe(false);
  });

  it('enrolls with the PRF result from create and binds the passkey to this host', async () => {
    const { env, create, get } = environment();
    create.mockResolvedValue(credential(prfResult(11)));
    const result = await createPasskeyAuthenticator(() => env).enroll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.credentialId).toBe(encodeBase64Url(RAW_ID));
    expect(result.value.prfOutput).toEqual(new Uint8Array(32).fill(11));
    expect(get).not.toHaveBeenCalled();
    const options = create.mock.calls[0]?.[0]?.publicKey;
    expect(options?.rp.id).toBe(SYNTHETIC_HOST);
    expect(options?.authenticatorSelection).toEqual({
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    });
    const salt = (options?.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first;
    expect(salt).toHaveLength(32);
    expect(encodeBase64Url(salt)).toBe(result.value.prfSalt);
  });

  it('falls back to an assertion when create does not return the PRF result', async () => {
    const { env, create, get } = environment();
    create.mockResolvedValue(credential({ prf: { enabled: true } }));
    get.mockResolvedValue(credential(prfResult(12)));
    const result = await createPasskeyAuthenticator(() => env).enroll();
    expect(result.ok && result.value.prfOutput).toEqual(new Uint8Array(32).fill(12));
    const options = get.mock.calls[0]?.[0]?.publicKey;
    expect(options?.rpId).toBe(SYNTHETIC_HOST);
    expect(options?.userVerification).toBe('required');
    expect(options?.allowCredentials?.[0]?.id).toEqual(RAW_ID);
  });

  it('forgets a created passkey that cannot be used', async () => {
    const unsupported = environment();
    unsupported.create.mockResolvedValue(credential({ prf: { enabled: false } }));
    expect(await createPasskeyAuthenticator(() => unsupported.env).enroll()).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(unsupported.signalUnknownCredential).toHaveBeenCalledWith({
      rpId: SYNTHETIC_HOST,
      credentialId: encodeBase64Url(RAW_ID),
    });

    const cancelled = environment();
    cancelled.create.mockResolvedValue(credential({}));
    cancelled.get.mockRejectedValue(new DOMException('synthetic', 'NotAllowedError'));
    expect(await createPasskeyAuthenticator(() => cancelled.env).enroll()).toEqual({
      ok: false,
      error: 'cancelled',
    });
    expect(cancelled.signalUnknownCredential).toHaveBeenCalledTimes(1);
  });

  it('maps a cancelled or failed ceremony without exposing browser errors', async () => {
    const { env, create, get } = environment();
    const authenticator = createPasskeyAuthenticator(() => env);
    create.mockRejectedValueOnce(new DOMException('synthetic', 'NotAllowedError'));
    expect(await authenticator.enroll()).toEqual({ ok: false, error: 'cancelled' });
    create.mockRejectedValueOnce(new DOMException('synthetic', 'SecurityError'));
    expect(await authenticator.enroll()).toEqual({ ok: false, error: 'unsupported' });
    create.mockRejectedValueOnce(new Error('synthetic'));
    expect(await authenticator.enroll()).toEqual({ ok: false, error: 'failed' });

    const info = {
      credentialId: encodeBase64Url(RAW_ID),
      prfSalt: encodeBase64Url(new Uint8Array(32).fill(3)),
    };
    get.mockRejectedValueOnce(new DOMException('synthetic', 'AbortError'));
    expect(await authenticator.evaluate(info)).toEqual({ ok: false, error: 'cancelled' });
    get.mockResolvedValueOnce(credential(prfResult(13, 16)));
    expect(await authenticator.evaluate(info)).toEqual({ ok: false, error: 'unsupported' });
    get.mockResolvedValueOnce(null);
    expect(await authenticator.evaluate(info)).toEqual({ ok: false, error: 'failed' });
    get.mockResolvedValueOnce(credential(prfResult(14)));
    expect(await authenticator.evaluate(info)).toEqual({
      ok: true,
      value: new Uint8Array(32).fill(14),
    });
    expect(await authenticator.evaluate({ ...info, credentialId: '***' as Base64Url })).toEqual({
      ok: false,
      error: 'failed',
    });
  });

  it('treats forget as best effort', async () => {
    const { env, signalUnknownCredential } = environment();
    signalUnknownCredential.mockRejectedValueOnce(new Error('synthetic'));
    await expect(
      createPasskeyAuthenticator(() => env).forget(encodeBase64Url(RAW_ID)),
    ).resolves.toBeUndefined();
    await expect(
      createPasskeyAuthenticator(() => environment({ publicKeyCredential: {} }).env).forget(
        encodeBase64Url(RAW_ID),
      ),
    ).resolves.toBeUndefined();
  });
});
