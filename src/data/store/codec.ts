import type { CryptoApi, EnvelopeAad } from '../../contracts/crypto.ts';
import type { LogicalId, Bytes } from '../../contracts/brand.ts';
import type { EntityMap, EntityName } from '../../contracts/entities.ts';
import type { LogicalRecord, RecordKeyProvider, StoredRecordRow } from '../../contracts/store.ts';
import { ENTITY_NAMES, ENTITY_RECORD_TYPE } from '../../contracts/store.ts';
import { utf8 } from '../../crypto/primitives/encoding.ts';

export type { RecordKeyMaterial, RecordKeyProvider } from '../../contracts/store.ts';

export interface RecordCodecOptions {
  readonly crypto: CryptoApi;
  readonly indexKey: CryptoKey;
  readonly keyProvider: RecordKeyProvider;
}

interface EncryptedRecordPayload {
  readonly entity: EntityName;
  readonly logicalId: LogicalId;
  readonly authorDevice: LogicalRecord['authorDevice'];
  readonly body?: EntityMap[EntityName];
}

function isEntityName(value: unknown): value is EntityName {
  return typeof value === 'string' && (ENTITY_NAMES as readonly string[]).includes(value);
}

function toBytes(value: string): Bytes {
  return utf8(value);
}

/** JSON string arrays encode the two identity strings injectively before HMAC. */
export function recordIdentityInput(entity: EntityName, logicalId: LogicalId): LogicalId {
  return JSON.stringify([entity, logicalId]) as LogicalId;
}

function parsePayload(value: unknown, deleted: boolean, hlc: LogicalRecord['hlc']): LogicalRecord {
  if (typeof value !== 'object' || value === null)
    throw new TypeError('Invalid encrypted record payload');
  const payload = value as Partial<EncryptedRecordPayload>;
  if (
    !isEntityName(payload.entity) ||
    typeof payload.logicalId !== 'string' ||
    typeof payload.authorDevice !== 'string'
  ) {
    throw new TypeError('Invalid encrypted record identity');
  }
  if (deleted) {
    return {
      entity: payload.entity,
      logicalId: payload.logicalId,
      authorDevice: payload.authorDevice,
      hlc,
      deleted: true,
    } as LogicalRecord;
  }
  if (!('body' in payload)) throw new TypeError('Encrypted record body is missing');
  return {
    entity: payload.entity,
    logicalId: payload.logicalId,
    authorDevice: payload.authorDevice,
    hlc,
    deleted: false,
    body: payload.body,
  } as LogicalRecord;
}

export async function encodeRecordRow(
  record: LogicalRecord,
  schemaVersion: number,
  options: RecordCodecOptions,
): Promise<StoredRecordRow> {
  const id = await options.crypto.opaqueId(
    options.indexKey,
    recordIdentityInput(record.entity, record.logicalId),
  );
  const type = ENTITY_RECORD_TYPE[record.entity];
  const payload: EncryptedRecordPayload = record.deleted
    ? { entity: record.entity, logicalId: record.logicalId, authorDevice: record.authorDevice }
    : {
        entity: record.entity,
        logicalId: record.logicalId,
        authorDevice: record.authorDevice,
        body: record.body,
      };
  const material = await options.keyProvider.forWrite(record);
  const aad: EnvelopeAad = { recordId: id, type, schemaVersion, epoch: material.epoch };
  const box = await options.crypto.seal(material.key, toBytes(JSON.stringify(payload)), aad);
  return { id, type, hlc: record.hlc, deleted: record.deleted, iv: box.iv, ct: box.ct };
}

export async function decodeRecordRow(
  row: StoredRecordRow,
  schemaVersion: number,
  options: RecordCodecOptions,
): Promise<LogicalRecord> {
  const candidates = await options.keyProvider.forRead(row.type, row);
  for (const material of candidates) {
    const aad: EnvelopeAad = {
      recordId: row.id,
      type: row.type,
      schemaVersion,
      epoch: material.epoch,
    };
    const opened = await options.crypto.open(material.key, { iv: row.iv, ct: row.ct }, aad);
    if (!opened.ok) continue;
    try {
      const payload: unknown = JSON.parse(new TextDecoder().decode(opened.value));
      const record = parsePayload(payload, row.deleted, row.hlc);
      if (ENTITY_RECORD_TYPE[record.entity] !== row.type)
        throw new TypeError('Encrypted record type mismatch');
      return record;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) throw error;
      throw new TypeError('Invalid encrypted record payload');
    }
  }
  throw new DOMException('Record authentication failed', 'DataError');
}

export function migrationSnapshotAad(
  recordId: StoredRecordRow['id'],
  schemaVersion: number,
  epoch = 0,
): EnvelopeAad {
  return { recordId, type: 'sys', schemaVersion, epoch };
}
