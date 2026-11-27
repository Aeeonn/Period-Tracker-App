/**
 * Flo Lite relay: stores one encrypted snapshot per couple. It never sees keys
 * that can decrypt the snapshot; it only checks the SHA-256 hash of the write key.
 *
 * It also sends reminder pushes. A phone registers its push subscription and a
 * list of send times; the relay only learns those times, never what they are for.
 * Each push carries a bare signal such as {"k":"tick"}, and the phone writes the
 * notification text from its own data.
 */

import {
  BROKEN,
  fromB64url,
  isPushKey,
  parseVapidJwk,
  sendPush,
  vapidPublicKey,
  type VapidJwk,
} from './push.ts';

/** A phone's push subscription. Only his phone is linked to a couple, for her "period started" signal. */
export interface Device {
  readonly id: string;
  readonly secretHash: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly coupleId: string | null;
}

export interface Store {
  getCouple(id: string): Promise<{ writeKeyHash: string } | null>;
  createCouple(id: string, writeKeyHash: string, now: number): Promise<boolean>;
  putSnapshot(id: string, iv: string, ct: string, now: number): Promise<void>;
  getSnapshot(id: string): Promise<{ iv: string; ct: string; updatedAt: number } | null>;
  /** Deletes the couple and its snapshot, and unlinks its devices. */
  deleteCouple(id: string): Promise<void>;
  getDevice(id: string): Promise<Device | null>;
  /** Creates or updates a device and replaces its send times. */
  saveDevice(device: Device, times: readonly number[], now: number): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  coupleDevices(coupleId: string, limit: number): Promise<Device[]>;
  /** Devices with send times at or before `now`, with their latest due time, oldest first. */
  dueDevices(now: number, limit: number): Promise<(Device & { latest: number })[]>;
  clearDue(id: string, now: number): Promise<void>;
}

/** The subset of Cloudflare's D1 binding used here. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
}

export interface Env {
  readonly DB: D1Like;
  /** Comma-separated list of allowed web origins. */
  readonly ALLOWED_ORIGINS?: string;
  /** Private VAPID key as a P-256 JWK (a Worker secret). Pushes are off without it. */
  readonly VAPID_PRIVATE_JWK?: string;
  /** VAPID contact, a URL or mailto: address. */
  readonly VAPID_SUBJECT?: string;
}

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_TIMES = 100;
/** Most pushes sent per cron run. */
export const MAX_SENDS = 40;
/** A reminder more than this late (the cron was down) is dropped instead of sent. */
export const STALE_MS = 2 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 11 * 366 * 24 * 60 * 60 * 1000;
const MAX_COUPLE_DEVICES = 4;
const ID = /^[A-Za-z0-9_-]{22}$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** Push services of Apple, Google, Mozilla and Microsoft. */
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

const DEVICE_COLUMNS =
  'd.id, d.secret_hash AS secretHash, d.endpoint, d.p256dh, d.auth, d.couple_id AS coupleId';

export function d1Store(db: D1Like): Store {
  return {
    getCouple: (id) =>
      db
        .prepare('SELECT write_key_hash AS writeKeyHash FROM couples WHERE id = ?')
        .bind(id)
        .first(),
    async createCouple(id, hash, now) {
      const existing = await db.prepare('SELECT id FROM couples WHERE id = ?').bind(id).first();
      if (existing !== null) return false;
      await db
        .prepare('INSERT INTO couples (id, write_key_hash, created_at) VALUES (?, ?, ?)')
        .bind(id, hash, now)
        .run();
      return true;
    },
    async putSnapshot(id, iv, ct, now) {
      await db
        .prepare(
          'INSERT INTO snapshots (couple_id, iv, ct, updated_at) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT (couple_id) DO UPDATE SET iv = excluded.iv, ct = excluded.ct, updated_at = excluded.updated_at',
        )
        .bind(id, iv, ct, now)
        .run();
    },
    getSnapshot: (id) =>
      db
        .prepare('SELECT iv, ct, updated_at AS updatedAt FROM snapshots WHERE couple_id = ?')
        .bind(id)
        .first(),
    async deleteCouple(id) {
      await db.batch([
        db.prepare('UPDATE push_devices SET couple_id = NULL WHERE couple_id = ?').bind(id),
        db.prepare('DELETE FROM snapshots WHERE couple_id = ?').bind(id),
        db.prepare('DELETE FROM couples WHERE id = ?').bind(id),
      ]);
    },
    getDevice: (id) =>
      db.prepare(`SELECT ${DEVICE_COLUMNS} FROM push_devices d WHERE d.id = ?`).bind(id).first(),
    async saveDevice(device, times, now) {
      await db.batch([
        db
          .prepare(
            'INSERT INTO push_devices (id, secret_hash, endpoint, p256dh, auth, couple_id, updated_at) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET endpoint = excluded.endpoint, ' +
              'p256dh = excluded.p256dh, auth = excluded.auth, couple_id = excluded.couple_id, ' +
              'updated_at = excluded.updated_at',
          )
          .bind(
            device.id,
            device.secretHash,
            device.endpoint,
            device.p256dh,
            device.auth,
            device.coupleId,
            now,
          ),
        db.prepare('DELETE FROM push_times WHERE device_id = ?').bind(device.id),
        ...times.map((at) =>
          db.prepare('INSERT INTO push_times (device_id, at) VALUES (?, ?)').bind(device.id, at),
        ),
      ]);
    },
    async deleteDevice(id) {
      await db.batch([
        db.prepare('DELETE FROM push_times WHERE device_id = ?').bind(id),
        db.prepare('DELETE FROM push_devices WHERE id = ?').bind(id),
      ]);
    },
    coupleDevices: async (coupleId, limit) =>
      (
        await db
          .prepare(`SELECT ${DEVICE_COLUMNS} FROM push_devices d WHERE d.couple_id = ? LIMIT ?`)
          .bind(coupleId, limit)
          .all<Device>()
      ).results,
    dueDevices: async (now, limit) =>
      (
        await db
          .prepare(
            `SELECT ${DEVICE_COLUMNS}, MAX(t.at) AS latest FROM push_times t ` +
              'JOIN push_devices d ON d.id = t.device_id WHERE t.at <= ? ' +
              'GROUP BY d.id ORDER BY MIN(t.at) LIMIT ?',
          )
          .bind(now, limit)
          .all<Device & { latest: number }>()
      ).results,
    async clearDue(id, now) {
      await db
        .prepare('DELETE FROM push_times WHERE device_id = ? AND at <= ?')
        .bind(id, now)
        .run();
    },
  };
}

/** In-memory store for tests and local development. */
export function memoryStore(): Store & {
  readonly couples: Map<string, string>;
  readonly snapshots: Map<string, { iv: string; ct: string; updatedAt: number }>;
  readonly devices: Map<string, Device>;
  readonly times: Map<string, number[]>;
} {
  const couples = new Map<string, string>();
  const snapshots = new Map<string, { iv: string; ct: string; updatedAt: number }>();
  const devices = new Map<string, Device>();
  const times = new Map<string, number[]>();
  return {
    couples,
    snapshots,
    devices,
    times,
    getCouple: async (id) => {
      const hash = couples.get(id);
      return hash === undefined ? null : { writeKeyHash: hash };
    },
    createCouple: async (id, hash) => {
      if (couples.has(id)) return false;
      couples.set(id, hash);
      return true;
    },
    putSnapshot: async (id, iv, ct, now) => {
      snapshots.set(id, { iv, ct, updatedAt: now });
    },
    getSnapshot: async (id) => snapshots.get(id) ?? null,
    deleteCouple: async (id) => {
      for (const device of devices.values()) {
        if (device.coupleId === id) devices.set(device.id, { ...device, coupleId: null });
      }
      snapshots.delete(id);
      couples.delete(id);
    },
    getDevice: async (id) => devices.get(id) ?? null,
    saveDevice: async (device, at) => {
      const existing = devices.get(device.id);
      devices.set(device.id, { ...device, secretHash: existing?.secretHash ?? device.secretHash });
      times.set(device.id, [...at]);
    },
    deleteDevice: async (id) => {
      devices.delete(id);
      times.delete(id);
    },
    coupleDevices: async (coupleId, limit) =>
      [...devices.values()].filter((device) => device.coupleId === coupleId).slice(0, limit),
    dueDevices: async (now, limit) =>
      [...devices.values()]
        .map((device) => ({ device, due: (times.get(device.id) ?? []).filter((at) => at <= now) }))
        .filter(({ due }) => due.length > 0)
        .sort((a, b) => Math.min(...a.due) - Math.min(...b.due))
        .slice(0, limit)
        .map(({ device, due }) => ({ ...device, latest: Math.max(...due) })),
    clearDue: async (id, now) => {
      times.set(
        id,
        (times.get(id) ?? []).filter((at) => at > now),
      );
    },
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES || request.body === null) return null;
  // Read with a byte cap, so a body without a content-length can't be read whole.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return B64.test(token) ? token : '';
}

async function authorised(request: Request, store: Store, id: string): Promise<boolean | null> {
  const couple = await store.getCouple(id);
  if (couple === null) return null;
  const token = bearerToken(request);
  if (token === '') return false;
  return sameText(await sha256Hex(token), couple.writeKeyHash);
}

/** A device's own secret proves it; a new device is created with whatever secret it presents. */
async function deviceAccess(
  request: Request,
  store: Store,
  id: string,
): Promise<{ device: Device | null; secretHash: string } | null> {
  const token = bearerToken(request);
  if (token.length < 22 || token.length > 64) return null;
  const secretHash = await sha256Hex(token);
  const device = await store.getDevice(id);
  if (device !== null && !sameText(secretHash, device.secretHash)) return null;
  return { device, secretHash };
}

function bytesOf(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || !B64.test(text) || text.length > 200) return null;
  try {
    return fromB64url(text);
  } catch {
    return null;
  }
}

function pushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1024) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '')
      return null;
    return PUSH_HOSTS.some((pattern) => pattern.test(host)) ? url.href : null;
  } catch {
    return null;
  }
}

function sendTimes(value: unknown, now: number): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_TIMES) return null;
  const times = new Set<number>();
  for (const at of value) {
    if (
      typeof at !== 'number' ||
      !Number.isSafeInteger(at) ||
      at % 60_000 !== 0 ||
      at < now - 60 * 60 * 1000 ||
      at > now + MAX_FUTURE_MS
    )
      return null;
    times.add(at);
  }
  return [...times];
}

function vapidOf(env: Env): { jwk: VapidJwk; subject: string } | null {
  const jwk = parseVapidJwk(env.VAPID_PRIVATE_JWK);
  return jwk === null ? null : { jwk, subject: env.VAPID_SUBJECT ?? 'https://flo-lite.pages.dev' };
}

/** Calls the global fetch without detaching it (Workers reject a detached `this`). */
const globalFetch: typeof fetch = (input, init) => fetch(input, init);

/** Push gone for good: the phone unsubscribed or the app was removed. */
const gone = (status: number): boolean => status === 404 || status === 410 || status === BROKEN;
const delivered = (status: number): boolean => status >= 200 && status < 300;

/**
 * Send the reminders that are due: one silent-text "tick" per phone, however
 * many of its times fell due. A failed send is retried on later runs until the
 * reminder is more than {@link STALE_MS} late, and is then dropped.
 */
export async function runDue(
  env: Env,
  store: Store,
  now: number,
  fetcher: typeof fetch = globalFetch,
): Promise<{ sent: number; dropped: number; removed: number }> {
  const result = { sent: 0, dropped: 0, removed: 0 };
  const vapid = vapidOf(env);
  if (vapid === null) return result;
  for (const device of await store.dueDevices(now, MAX_SENDS)) {
    if (device.latest < now - STALE_MS) {
      result.dropped += 1;
      await store.clearDue(device.id, now);
      continue;
    }
    const status = await sendPush(device, { k: 'tick' }, vapid, {
      ttl: 60 * 60,
      nowMs: now,
      fetcher,
    });
    if (gone(status)) {
      await store.deleteDevice(device.id);
      result.removed += 1;
    } else if (delivered(status)) {
      result.sent += 1;
      await store.clearDue(device.id, now);
    }
  }
  return result;
}

export async function handle(
  request: Request,
  env: Env,
  store: Store = d1Store(env.DB),
  now: number = Date.now(),
  fetcher: typeof fetch = globalFetch,
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const reply = (status: number, body?: unknown): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'cache-control': 'no-store',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
    });

  if (request.method === 'OPTIONS') return reply(204);

  const path = new URL(request.url).pathname;
  const vapid = vapidOf(env);

  if (path === '/v1/push/key') {
    if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
    return vapid === null
      ? reply(503, { error: 'push_off' })
      : reply(200, { key: vapidPublicKey(vapid.jwk) });
  }

  const deviceMatch = /^\/v1\/devices\/([^/]+)(\/test)?$/.exec(path);
  if (deviceMatch !== null) {
    const id = deviceMatch[1]!;
    if (!ID.test(id)) return reply(400, { error: 'bad_id' });
    const access = await deviceAccess(request, store, id);
    const testPath = deviceMatch[2] !== undefined;

    if (!testPath && request.method === 'PUT') {
      if (access === null) return reply(403, { error: 'forbidden' });
      const body = await readJson(request);
      const endpoint = pushEndpoint(body?.endpoint);
      const p256dh = bytesOf(body?.p256dh);
      const auth = bytesOf(body?.auth);
      const times = sendTimes(body?.times, now);
      const coupleId = body?.coupleId ?? null;
      if (
        endpoint === null ||
        p256dh?.byteLength !== 65 ||
        p256dh[0] !== 4 ||
        auth?.byteLength !== 16 ||
        times === null ||
        (coupleId !== null && (typeof coupleId !== 'string' || !ID.test(coupleId))) ||
        !(await isPushKey(p256dh))
      ) {
        return reply(400, { error: 'bad_body' });
      }
      if (coupleId !== null && (await store.getCouple(coupleId)) === null)
        return reply(400, { error: 'no_couple' });
      await store.saveDevice(
        {
          id,
          secretHash: access.secretHash,
          endpoint,
          p256dh: body!.p256dh as string,
          auth: body!.auth as string,
          coupleId,
        },
        times,
        now,
      );
      return reply(access.device === null ? 201 : 204);
    }

    if (!testPath && request.method === 'DELETE') {
      if (access === null) return reply(403, { error: 'forbidden' });
      if (access.device === null) return reply(404, { error: 'no_device' });
      await store.deleteDevice(id);
      return reply(204);
    }

    if (testPath && request.method === 'POST') {
      if (access === null) return reply(403, { error: 'forbidden' });
      if (access.device === null) return reply(404, { error: 'no_device' });
      if (vapid === null) return reply(503, { error: 'push_off' });
      const status = await sendPush(access.device, { k: 'test' }, vapid, {
        ttl: 60 * 60,
        nowMs: now,
        fetcher,
      });
      if (gone(status)) {
        await store.deleteDevice(id);
        return reply(410, { error: 'gone' });
      }
      return delivered(status) ? reply(204) : reply(502, { error: 'push_failed', status });
    }

    return reply(405, { error: 'method_not_allowed' });
  }

  const match = /^\/v1\/couples\/([^/]+)(\/snapshot|\/events)?$/.exec(path);
  if (match === null) return reply(404, { error: 'not_found' });
  const id = match[1]!;
  if (!ID.test(id)) return reply(400, { error: 'bad_id' });
  const snapshotPath = match[2] === '/snapshot';

  if (match[2] === '/events') {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const ok = await authorised(request, store, id);
    if (ok === null) return reply(404, { error: 'no_couple' });
    if (!ok) return reply(403, { error: 'forbidden' });
    const body = await readJson(request);
    // The relay only learns that her phone wants his phone woken, not why.
    if (body?.kind !== 'signal') return reply(400, { error: 'bad_body' });
    if (vapid === null) return reply(503, { error: 'push_off' });
    let sent = 0;
    for (const device of await store.coupleDevices(id, MAX_COUPLE_DEVICES)) {
      const status = await sendPush(device, { k: 's' }, vapid, {
        ttl: 24 * 60 * 60,
        nowMs: now,
        fetcher,
      });
      if (gone(status)) await store.deleteDevice(device.id);
      else if (delivered(status)) sent += 1;
    }
    return reply(200, { sent });
  }

  if (!snapshotPath && request.method === 'PUT') {
    const body = await readJson(request);
    const hash = body?.writeKeyHash;
    if (typeof hash !== 'string' || !HEX64.test(hash)) return reply(400, { error: 'bad_body' });
    return (await store.createCouple(id, hash, now)) ? reply(201) : reply(409, { error: 'exists' });
  }

  if (!snapshotPath && request.method === 'DELETE') {
    const ok = await authorised(request, store, id);
    if (ok === null) return reply(404, { error: 'no_couple' });
    if (!ok) return reply(403, { error: 'forbidden' });
    await store.deleteCouple(id);
    return reply(204);
  }

  if (snapshotPath && request.method === 'PUT') {
    const ok = await authorised(request, store, id);
    if (ok === null) return reply(404, { error: 'no_couple' });
    if (!ok) return reply(403, { error: 'forbidden' });
    const body = await readJson(request);
    const { iv, ct } = body ?? {};
    if (
      typeof iv !== 'string' ||
      typeof ct !== 'string' ||
      !B64.test(iv) ||
      !B64.test(ct) ||
      // A 12-byte IV is 16 characters; the ciphertext holds at least the 16-byte tag.
      iv.length !== 16 ||
      ct.length < 22
    ) {
      return reply(400, { error: 'bad_body' });
    }
    await store.putSnapshot(id, iv, ct, now);
    return reply(204);
  }

  if (snapshotPath && request.method === 'GET') {
    if ((await store.getCouple(id)) === null) return reply(404, { error: 'no_couple' });
    const snapshot = await store.getSnapshot(id);
    return snapshot === null ? reply(404, { error: 'no_snapshot' }) : reply(200, snapshot);
  }

  return reply(405, { error: 'method_not_allowed' });
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
  scheduled: (
    _controller: unknown,
    env: Env,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) => {
    context.waitUntil(runDue(env, d1Store(env.DB), Date.now()));
  },
};
