import { describe, expect, it } from 'vitest';
import { fromBase64Url, timingSafeEqual, toBase64Url, utf8 } from '../src/bytes.ts';
import {
  canonicalMessage,
  isFresh,
  parseSigHeader,
  signRequest,
  verifySignature,
} from '../src/signed-request.ts';

describe('base64url', () => {
  it('round-trips arbitrary bytes and rejects non-base64url text', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(fromBase64Url('a+b/')).toBeNull();
    expect(fromBase64Url('abc=')).toBeNull();
    expect(fromBase64Url('a')).toBeNull();
  });

  it('compares in constant time and treats lengths as unequal', () => {
    expect(timingSafeEqual(utf8('abc'), utf8('abc'))).toBe(true);
    expect(timingSafeEqual(utf8('abc'), utf8('abd'))).toBe(false);
    expect(timingSafeEqual(utf8('abc'), utf8('abcd'))).toBe(false);
  });
});

describe('Sig header', () => {
  const sig64 = toBase64Url(new Uint8Array(64).fill(9));

  it('parses deviceId, ts, nonce and a 64-byte signature', () => {
    expect(parseSigHeader(`dev-1, 1800000000, nonce-abcdefghijklmn, ${sig64}`)).toEqual({
      deviceId: 'dev-1',
      ts: 1_800_000_000,
      nonce: 'nonce-abcdefghijklmn',
      signature: new Uint8Array(64).fill(9),
    });
  });

  it.each([
    null,
    '',
    'dev-1, 1800000000, nonce-abcdefghijklmn',
    `dev 1, 1800000000, nonce-abcdefghijklmn, ${sig64}`,
    `dev-1, -5, nonce-abcdefghijklmn, ${sig64}`,
    `dev-1, 1800000000, short, ${sig64}`,
    `dev-1, 1800000000, nonce-abcdefghijklmn, ${toBase64Url(new Uint8Array(63))}`,
    `dev-1, 1800000000, nonce-abcdefghijklmn, ${sig64}, extra`,
  ])('rejects %s', (value) => {
    expect(parseSigHeader(value)).toBeNull();
  });

  it('checks the +-300 s window inclusively', () => {
    expect(isFresh(1000, 1300)).toBe(true);
    expect(isFresh(1000, 700)).toBe(true);
    expect(isFresh(1000, 1301)).toBe(false);
    expect(isFresh(1000, 699)).toBe(false);
  });
});

describe('ECDSA P-256 request signatures', () => {
  it('verifies a signature over method|path|ts|nonce|SHA-256(body) and rejects changes', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const body = utf8('{"synthetic":true}');
    const header = await signRequest(
      pair.privateKey,
      'dev-1',
      'post',
      '/spike/signed',
      42,
      'nonce-abcdefghijklmn',
      body,
    );
    const parsed = parseSigHeader(header);
    if (!parsed) throw new Error('header did not parse');
    const message = await canonicalMessage(
      'POST',
      '/spike/signed',
      42,
      'nonce-abcdefghijklmn',
      body,
    );
    expect(new TextDecoder().decode(message)).toMatch(
      /^POST\|\/spike\/signed\|42\|nonce-abcdefghijklmn\|[A-Za-z0-9_-]{43}$/,
    );
    expect(await verifySignature(publicRaw, parsed.signature, message)).toBe(true);
    const otherPath = await canonicalMessage(
      'POST',
      '/spike/other',
      42,
      'nonce-abcdefghijklmn',
      body,
    );
    expect(await verifySignature(publicRaw, parsed.signature, otherPath)).toBe(false);
    expect(await verifySignature(new Uint8Array(65), parsed.signature, message)).toBe(false);
  });
});
