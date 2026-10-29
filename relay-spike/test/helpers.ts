// Test-only helpers. Synthetic keys and data only.
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { type Bytes, concat, fromBase64Url, sha256, toHex, utf8 } from '../src/bytes.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/d1.ts';

const schemaPath = new URL('../schema.sql', import.meta.url);

class SqliteStatement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteStatement(this.db, this.sql, values);
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.values as SQLInputValue[]));
    return Promise.resolve((row ?? null) as T | null);
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(this.execute<T>());
  }

  execute<T>(): D1Result<T> {
    const statement = this.db.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql) || /^\s*SELECT\b/i.test(this.sql)) {
      const rows = statement.all(...(this.values as SQLInputValue[])) as T[];
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const result = statement.run(...(this.values as SQLInputValue[]));
    return { results: [], success: true, meta: { changes: Number(result.changes) } };
  }
}

/** An in-memory D1 stand-in over node:sqlite, loaded with the real relay-spike/schema.sql. */
export function createTestD1(): D1Database & { sqlite: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return {
    sqlite: db,
    prepare: (query) => new SqliteStatement(db, query),
    batch: <T>(statements: D1PreparedStatement[]) => {
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => (statement as SqliteStatement).execute<T>());
        db.exec('COMMIT');
        return Promise.resolve(results);
      } catch (error) {
        db.exec('ROLLBACK');
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}

export async function hashHex(text: string): Promise<string> {
  return toHex(await sha256(utf8(text)));
}

export async function newVapidJwk(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
}

export interface SyntheticSubscription {
  privateKey: CryptoKey;
  p256dh: Bytes;
  auth: Bytes;
}

export async function newSyntheticSubscription(): Promise<SyntheticSubscription> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    p256dh: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    auth: crypto.getRandomValues(new Uint8Array(16)),
  };
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

/** Receiver side of RFC 8291/8188 (single record), written independently of the sender code. */
export async function decryptPushBody(
  body: Bytes,
  uaPrivate: CryptoKey,
  uaPublic: Bytes,
  authSecret: Bytes,
): Promise<{ plaintext: string; recordSize: number; senderPublic: Bytes }> {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const salt = body.slice(0, 16);
  const recordSize = view.getUint32(16);
  const idLength = body[20] ?? 0;
  const senderPublic = body.slice(21, 21 + idLength);
  const record = body.slice(21 + idLength);
  const senderKey = await crypto.subtle.importKey(
    'raw',
    senderPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, uaPrivate, 256),
  );
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(utf8('WebPush: info\0'), uaPublic, senderPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2) throw new Error('missing last-record delimiter');
  return { plaintext: new TextDecoder().decode(padded.slice(0, end)), recordSize, senderPublic };
}

/** Verifies an ES256 compact JWT against a raw uncompressed P-256 public key. */
export async function verifyJwt(
  jwt: string,
  publicRaw: Bytes,
): Promise<{ header: unknown; claims: Record<string, unknown> } | null> {
  const [header, claims, signature] = jwt.split('.');
  if (!header || !claims || !signature) return null;
  const sig = fromBase64Url(signature);
  const key = await crypto.subtle.importKey(
    'raw',
    publicRaw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  if (
    !sig ||
    !(await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sig,
      utf8(`${header}.${claims}`),
    ))
  ) {
    return null;
  }
  const decode = (part: string): unknown =>
    JSON.parse(new TextDecoder().decode(fromBase64Url(part) ?? new Uint8Array()));
  return { header: decode(header), claims: decode(claims) as Record<string, unknown> };
}
