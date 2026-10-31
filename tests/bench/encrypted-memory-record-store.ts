import type { LogicalId } from '../../src/contracts/brand.ts';
import type { EntityName, Hlc } from '../../src/contracts/entities.ts';
import type {
  LogicalRecord,
  RecordStore,
  RecordTransaction,
  StoredRecordRow,
} from '../../src/contracts/store.ts';
import { ENTITY_RECORD_TYPE } from '../../src/contracts/store.ts';
import {
  decodeRecordRow,
  encodeRecordRow,
  recordIdentityInput,
  type RecordCodecOptions,
} from '../../src/data/store/codec.ts';

/** A RecordStore adapter that persists only real codec-produced ciphertext rows. */
export class EncryptedMemoryRecordStore implements RecordStore {
  private rows = new Map<string, StoredRecordRow>();

  constructor(
    private readonly codec: RecordCodecOptions,
    private readonly schemaVersion: number,
  ) {}

  get rowCount(): number {
    return this.rows.size;
  }

  rawRows(): readonly StoredRecordRow[] {
    return [...this.rows.values()];
  }

  async get<E extends EntityName>(entity: E, id: LogicalId): Promise<LogicalRecord<E> | undefined> {
    return this.getFrom(this.rows, entity, id);
  }

  async put<E extends EntityName>(record: LogicalRecord<E>): Promise<void> {
    await this.putInto(this.rows, record as LogicalRecord);
  }

  async delete(entity: EntityName, id: LogicalId, hlc: Hlc): Promise<void> {
    await this.deleteInto(this.rows, entity, id, hlc);
  }

  async list<E extends EntityName>(
    entity: E,
    options?: { readonly includeDeleted?: boolean },
  ): Promise<readonly LogicalRecord<E>[]> {
    return this.listFrom(this.rows, entity, options?.includeDeleted === true);
  }

  async transaction<R>(work: (tx: RecordTransaction) => Promise<R>): Promise<R> {
    const working = new Map(this.rows);
    const tx: RecordTransaction = {
      get: async <E extends EntityName>(entity: E, id: LogicalId) =>
        this.getFrom(working, entity, id),
      put: async <E extends EntityName>(record: LogicalRecord<E>) =>
        this.putInto(working, record as LogicalRecord),
      delete: async (entity, id, hlc) => this.deleteInto(working, entity, id, hlc),
      list: async <E extends EntityName>(
        entity: E,
        options?: { readonly includeDeleted?: boolean },
      ) => this.listFrom(working, entity, options?.includeDeleted === true),
    };
    const result = await work(tx);
    this.rows = working;
    return result;
  }

  private async getFrom<E extends EntityName>(
    rows: Map<string, StoredRecordRow>,
    entity: E,
    id: LogicalId,
  ): Promise<LogicalRecord<E> | undefined> {
    const opaqueId = await this.codec.crypto.opaqueId(
      this.codec.indexKey,
      recordIdentityInput(entity, id),
    );
    const row = rows.get(opaqueId);
    if (!row) return undefined;
    const record = await decodeRecordRow(row, this.schemaVersion, this.codec);
    return record.entity === entity ? (record as LogicalRecord<E>) : undefined;
  }

  private async putInto(
    rows: Map<string, StoredRecordRow>,
    record: LogicalRecord,
  ): Promise<void> {
    const row = await encodeRecordRow(record, this.schemaVersion, this.codec);
    rows.set(row.id, row);
  }

  private async deleteInto(
    rows: Map<string, StoredRecordRow>,
    entity: EntityName,
    id: LogicalId,
    hlc: Hlc,
  ): Promise<void> {
    const tombstone: LogicalRecord = {
      entity,
      logicalId: id,
      authorDevice: hlc.deviceId,
      hlc,
      deleted: true,
    } as LogicalRecord;
    await this.putInto(rows, tombstone);
  }

  private async listFrom<E extends EntityName>(
    rows: Map<string, StoredRecordRow>,
    entity: E,
    includeDeleted: boolean,
  ): Promise<readonly LogicalRecord<E>[]> {
    const encoded = [...rows.values()].filter((row) => row.type === ENTITY_RECORD_TYPE[entity]);
    const decoded = await Promise.all(
      encoded.map((row) => decodeRecordRow(row, this.schemaVersion, this.codec)),
    );
    const result: LogicalRecord<E>[] = [];
    for (const record of decoded) {
      if (record.entity === entity && (includeDeleted || !record.deleted)) {
        result.push(record as LogicalRecord<E>);
      }
    }
    return result;
  }
}