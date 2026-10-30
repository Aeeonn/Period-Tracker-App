// P0 relay spike request handler. Synthetic data only; nothing is logged (no console calls,
// no client IP, user-agent or cf geolocation fields are read).
import {
  type Bytes,
  fromBase64Url,
  sha256,
  timingSafeEqual,
  toBase64Url,
  toHex,
  utf8,
} from './bytes.ts';
import type { D1Database } from './d1.ts';
import {
  NONCE_TTL_SECONDS,
  canonicalMessage,
  isFresh,
  parseSigHeader,
  verifySignature,
} from './signed-request.ts';
import { buildPushRequest, importVapidKeys, parseSubscription } from './webpush.ts';

export interface Env {
  DB: D1Database;
  /** Hex SHA-256 of the preview-only enrollment secret (Worker secret). */
  ENROLLMENT_SECRET_HASH?: string;
  /** Preview-only VAPID P-256 private key as JWK JSON (Worker secret). */
  VAPID_PRIVATE_JWK?: string;
  /** Comma-separated exact browser origins allowed to call /push-test without the secret. */
  PROBE_ORIGINS?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface Deps {
  fetch: FetchLike;
  nowMs: () => number;
}

export const MAX_BODY_BYTES = 16 * 1024;
export const PUSH_TEST_LIMIT = 5;
export const PUSH_TEST_WINDOW_SECONDS = 600;
const NONCE_BUCKET_SECONDS = 60;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const unauthorized = (): Response => json(401, { error: 'unauthorized' });

function isProbeOriginAllowed(env: Env, origin: string | null): origin is string {
  if (!origin) return false;
  return (env.PROBE_ORIGINS ?? '').split(',').some((entry) => entry.trim() === origin);
}

function withPushTestCors(response: Response, origin: string, preflight = false): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  const vary = (headers.get('vary') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!vary.some((entry) => entry.toLowerCase() === 'origin')) vary.push('Origin');
  headers.set('vary', vary.join(', '));
  if (preflight) {
    headers.set('access-control-allow-methods', 'POST');
    headers.set('access-control-allow-headers', 'Content-Type');
    headers.set('access-control-max-age', '600');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readBody(request: Request): Promise<Bytes | Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'body too large' });
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Bytes[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size limit still takes precedence if stream cancellation fails.
        }
        return json(413, { error: 'body too large' });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function parseJson(body: Bytes): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
}

/** Enrollment-secret check: `Authorization: Bearer <secret>`, compared by SHA-256 in constant time. */
async function checkEnrollment(request: Request, env: Env): Promise<Response | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(header);
  if (!match?.[1]) return unauthorized();
  const expected = env.ENROLLMENT_SECRET_HASH?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) return json(503, { error: 'not configured' });
  const provided = toHex(await sha256(utf8(match[1])));
  return timingSafeEqual(utf8(provided), utf8(expected)) ? null : unauthorized();
}

/** Signed-request check: header, clock skew, device lookup (D1 read), ECDSA, nonce (D1 write). */
async function checkSigned(
  request: Request,
  env: Env,
  path: string,
  body: Bytes,
  nowSeconds: number,
): Promise<Response | null> {
  const sig = parseSigHeader(request.headers.get('sig'));
  if (!sig || !isFresh(sig.ts, nowSeconds)) return unauthorized();
  const device = await env.DB.prepare('SELECT public_key FROM devices WHERE id = ?')
    .bind(sig.deviceId)
    .first<{ public_key: string }>();
  const publicKey = device ? fromBase64Url(device.public_key) : null;
  if (!publicKey) return unauthorized();
  const message = await canonicalMessage(request.method, path, sig.ts, sig.nonce, body);
  if (!(await verifySignature(publicKey, sig.signature, message))) return unauthorized();
  const bucket = Math.floor(nowSeconds / NONCE_BUCKET_SECONDS);
  const [, inserted] = await env.DB.batch([
    env.DB.prepare('DELETE FROM nonces WHERE expires_bucket < ?').bind(bucket),
    env.DB.prepare(
      'INSERT OR IGNORE INTO nonces (device_id, nonce, expires_bucket) VALUES (?, ?, ?)',
    ).bind(
      sig.deviceId,
      sig.nonce,
      bucket + Math.ceil(NONCE_TTL_SECONDS / NONCE_BUCKET_SECONDS) + 1,
    ),
  ]);
  if (!inserted || inserted.meta.changes !== 1) return json(409, { error: 'replayed nonce' });
  return null;
}

/** Fixed-window counter in D1: at most PUSH_TEST_LIMIT authorized push tests per window. */
async function takePushTestSlot(env: Env, nowSeconds: number): Promise<boolean> {
  const win = Math.floor(nowSeconds / PUSH_TEST_WINDOW_SECONDS);
  const [, counted] = await env.DB.batch<{ count: number }>([
    env.DB.prepare('DELETE FROM rate_limits WHERE win < ?').bind(win),
    env.DB.prepare(
      'INSERT INTO rate_limits (name, win, count) VALUES (?, ?, 1) ' +
        'ON CONFLICT (name, win) DO UPDATE SET count = count + 1 RETURNING count',
    ).bind('push-test', win),
  ]);
  const count = counted?.results[0]?.count ?? Number.POSITIVE_INFINITY;
  return count <= PUSH_TEST_LIMIT;
}

function pushReason(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { reason?: unknown };
    if (typeof parsed.reason === 'string' && /^[A-Za-z0-9 _.-]{1,64}$/.test(parsed.reason)) {
      return parsed.reason;
    }
  } catch {
    // Not JSON: no reason is reported.
  }
  return undefined;
}

async function pushTest(
  request: Request,
  env: Env,
  deps: Deps,
  now: number,
  allowlistedOrigin: boolean,
): Promise<Response> {
  const denied = await checkEnrollment(request, env);
  if (denied && !allowlistedOrigin) return denied;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const input = parseJson(body) as { subscription?: unknown } | undefined;
  const subscription = parseSubscription(input?.subscription);
  if (!subscription) return json(400, { error: 'invalid subscription' });
  const vapid = env.VAPID_PRIVATE_JWK ? await importVapidKeys(env.VAPID_PRIVATE_JWK) : null;
  if (!vapid) return json(503, { error: 'not configured' });
  if (!(await takePushTestSlot(env, now))) return json(429, { error: 'rate limited' });
  const push = await buildPushRequest(subscription, vapid, new URL(request.url).origin, now);
  let response: Response;
  try {
    response = await deps.fetch(push.url, {
      method: 'POST',
      headers: push.headers,
      body: push.body,
      redirect: 'manual',
    });
  } catch {
    return json(502, { attempted: 1, error: 'push service unreachable' });
  }
  const reason = pushReason(await response.text());
  return json(200, {
    attempted: 1,
    pushService: subscription.endpoint.hostname,
    pushStatus: response.status,
    ...(reason ? { pushReason: reason } : {}),
  });
}

async function registerDevice(request: Request, env: Env): Promise<Response> {
  const denied = await checkEnrollment(request, env);
  if (denied) return denied;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const input = parseJson(body) as { deviceId?: unknown; publicKey?: unknown } | undefined;
  const deviceId = input?.deviceId;
  const publicKey = typeof input?.publicKey === 'string' ? fromBase64Url(input.publicKey) : null;
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId)) {
    return json(400, { error: 'invalid device' });
  }
  if (!publicKey || publicKey.length !== 65 || publicKey[0] !== 4) {
    return json(400, { error: 'invalid device' });
  }
  await env.DB.prepare('INSERT OR REPLACE INTO devices (id, public_key) VALUES (?, ?)')
    .bind(deviceId, toBase64Url(publicKey))
    .run();
  return json(201, { registered: true });
}

async function spikeRoute(
  request: Request,
  env: Env,
  path: string,
  now: number,
  withPushSigning: boolean,
): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const denied = await checkSigned(request, env, path, body, now);
  if (denied) return denied;
  if (!withPushSigning) return json(200, { ok: true });
  // FB-02 per-push cost: VAPID JWT signing plus payload encryption, without sending anything.
  const vapid = env.VAPID_PRIVATE_JWK ? await importVapidKeys(env.VAPID_PRIVATE_JWK) : null;
  if (!vapid) return json(503, { error: 'not configured' });
  const input = parseJson(body) as { subscription?: unknown } | undefined;
  const subscription = parseSubscription(input?.subscription);
  if (!subscription) return json(400, { error: 'invalid subscription' });
  const push = await buildPushRequest(subscription, vapid, new URL(request.url).origin, now);
  return json(200, { ok: true, encryptedBytes: push.body.length });
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const path = new URL(request.url).pathname;
  const now = Math.floor(deps.nowMs() / 1000);
  const requestOrigin = path === '/push-test' ? request.headers.get('origin') : null;
  const corsOrigin = isProbeOriginAllowed(env, requestOrigin) ? requestOrigin : null;
  const addPushTestCors = (response: Response, preflight = false): Response =>
    corsOrigin ? withPushTestCors(response, corsOrigin, preflight) : response;
  try {
    if (path === '/push-test') {
      if (request.method === 'OPTIONS') {
        return addPushTestCors(
          corsOrigin
            ? new Response(null, { status: 204 })
            : json(403, { error: 'origin not allowed' }),
          true,
        );
      }
      if (request.method !== 'POST')
        return addPushTestCors(json(405, { error: 'method not allowed' }));
      return addPushTestCors(await pushTest(request, env, deps, now, corsOrigin !== null));
    }
    if (path === '/vapid-public-key') {
      if (request.method !== 'GET') return json(405, { error: 'method not allowed' });
      const vapid = env.VAPID_PRIVATE_JWK ? await importVapidKeys(env.VAPID_PRIVATE_JWK) : null;
      return vapid
        ? json(200, { key: toBase64Url(vapid.publicRaw) })
        : json(503, { error: 'not configured' });
    }
    const routes = new Map<string, () => Promise<Response>>([
      ['/spike/devices', () => registerDevice(request, env)],
      ['/spike/signed', () => spikeRoute(request, env, path, now, false)],
      ['/spike/push-sign', () => spikeRoute(request, env, path, now, true)],
    ]);
    const route = routes.get(path);
    if (!route) return json(404, { error: 'not found' });
    if (request.method !== 'POST') return json(405, { error: 'method not allowed' });
    return await route();
  } catch {
    return addPushTestCors(json(500, { error: 'internal error' }));
  }
}
