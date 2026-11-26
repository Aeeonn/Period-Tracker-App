/**
 * Flo Lite relay: stores one encrypted snapshot per couple. It never sees keys
 * that can decrypt the snapshot; it only checks the SHA-256 hash of the write key.
 */

export interface Store {
  getCouple(id: string): Promise<{ writeKeyHash: string } | null>;
  createCouple(id: string, writeKeyHash: string, now: number): Promise<boolean>;
  putSnapshot(id: string, iv: string, ct: string, now: number): Promise<void>;
  getSnapshot(id: string): Promise<{ iv: string; ct: string; updatedAt: number } | null>;
  deleteCouple(id: string): Promise<void>;
}

/** The subset of Cloudflare's D1 binding used here. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
}

export interface Env {
  readonly DB: D1Like;
  /** Comma-separated list of allowed web origins. */
  readonly ALLOWED_ORIGINS?: string;
}

export const MAX_BODY_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9_-]{22}$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const HEX64 = /^[0-9a-f]{64}$/;

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
        db.prepare('DELETE FROM snapshots WHERE couple_id = ?').bind(id),
        db.prepare('DELETE FROM couples WHERE id = ?').bind(id),
      ]);
    },
  };
}

/** In-memory store for tests and local development. */
export function memoryStore(): Store & {
  readonly couples: Map<string, string>;
  readonly snapshots: Map<string, { iv: string; ct: string; updatedAt: number }>;
} {
  const couples = new Map<string, string>();
  const snapshots = new Map<string, { iv: string; ct: string; updatedAt: number }>();
  return {
    couples,
    snapshots,
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
      snapshots.delete(id);
      couples.delete(id);
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
    'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function authorised(request: Request, store: Store, id: string): Promise<boolean | null> {
  const couple = await store.getCouple(id);
  if (couple === null) return null;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!B64.test(token)) return false;
  return sameText(await sha256Hex(token), couple.writeKeyHash);
}

export async function handle(
  request: Request,
  env: Env,
  store: Store = d1Store(env.DB),
  now: number = Date.now(),
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

  const match = /^\/v1\/couples\/([^/]+)(\/snapshot)?$/.exec(new URL(request.url).pathname);
  if (match === null) return reply(404, { error: 'not_found' });
  const id = match[1]!;
  if (!ID.test(id)) return reply(400, { error: 'bad_id' });
  const snapshotPath = match[2] !== undefined;

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
    if (typeof iv !== 'string' || typeof ct !== 'string' || !B64.test(iv) || !B64.test(ct)) {
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
};
