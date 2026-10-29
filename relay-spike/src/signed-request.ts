// Signed-request authentication from storage-sync-decision.md section 5:
// Sig: deviceId, ts, nonce, ECDSA-P256-SHA256(method|path|ts|nonce|SHA-256(body))
import { type Bytes, fromBase64Url, sha256, toBase64Url, utf8 } from './bytes.ts';

export const MAX_SKEW_SECONDS = 300;
export const NONCE_TTL_SECONDS = 600;

export interface SigHeader {
  deviceId: string;
  ts: number;
  nonce: string;
  signature: Bytes;
}

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const TS = /^[0-9]{1,12}$/;

export function parseSigHeader(value: string | null): SigHeader | null {
  if (value === null) return null;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 4) return null;
  const [deviceId, ts, nonce, sig] = parts as [string, string, string, string];
  if (!DEVICE_ID.test(deviceId) || !TS.test(ts) || !NONCE.test(nonce)) return null;
  const signature = fromBase64Url(sig);
  if (signature === null || signature.length !== 64) return null;
  return { deviceId, ts: Number(ts), nonce, signature };
}

export function isFresh(ts: number, nowSeconds: number): boolean {
  return Math.abs(nowSeconds - ts) <= MAX_SKEW_SECONDS;
}

export async function canonicalMessage(
  method: string,
  path: string,
  ts: number,
  nonce: string,
  body: Bytes,
): Promise<Bytes> {
  const bodyHash = toBase64Url(await sha256(body));
  return utf8(`${method.toUpperCase()}|${path}|${ts}|${nonce}|${bodyHash}`);
}

export async function verifySignature(
  publicKeyRaw: Bytes,
  signature: Bytes,
  message: Bytes,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyRaw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, message);
  } catch {
    return false;
  }
}

/** Client side: build the Sig header value for a request. Used by the measure script and tests. */
export async function signRequest(
  privateKey: CryptoKey,
  deviceId: string,
  method: string,
  path: string,
  ts: number,
  nonce: string,
  body: Bytes,
): Promise<string> {
  const message = await canonicalMessage(method, path, ts, nonce, body);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message),
  );
  return `${deviceId}, ${ts}, ${nonce}, ${toBase64Url(signature)}`;
}
