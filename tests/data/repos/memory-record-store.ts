import type { LogicalId } from '../../../src/contracts/brand.ts';
import type { EntityName } from '../../../src/contracts/entities.ts';
import type {
  LogicalRecord,
  RecordStore,
  RecordTransaction,
} from '../../../src/contracts/store.ts';
import type { Hlc } from '../../../src/contracts/entities.ts';

 type AnyRecord = LogicalRecord<EntityName>;

function recordKey(entity: EntityName, id: LogicalId): string {
  return `${entity}\u0000${id}`;
}

export class MemoryRecordStore implements RecordStore {
  private records = new Map<string, AnyRecord>();

  seed(record: LogicalRecord): void {
    this.records.set(recordKey(record.entity, record.logicalId), record);
  }

  inspect<E extends EntityName>(entity: E, id: LogicalId): LogicalRecord<E> | undefined {
    return this.find(this.records, entity, id);
  }

  async get<E extends EntityName>(entity: E, id: LogicalId): Promise<LogicalRecord<E> | undefined> {
    return this.find(this.records, entity, id);
  }

  async put<E extends EntityName>(record: LogicalRecord<E>): Promise<void> {
    this.records.set(recordKey(record.entity, record.logicalId), record as AnyRecord);
  }

  async delete(entity: EntityName, id: LogicalId, hlc: Hlc): Promise<void> {
    this.records.set(
      recordKey(entity, id),
      {
        entity,
        logicalId: id,
        authorDevice: hlc.deviceId,
        hlc,
        deleted: true,
      } as AnyRecord,
    );
  }

  async list<E extends EntityName>(
    entity: E,
    options?: { readonly includeDeleted?: boolean },
  ): Promise<readonly LogicalRecord<E>[]> {
    return this.listFrom(this.records, entity, options?.includeDeleted === true);
  }

  async transaction<R>(work: (tx: RecordTransaction) => Promise<R>): Promise<R> {
    const working = new Map(this.records);
    const tx: RecordTransaction = {
      get: async <E extends EntityName>(entity: E, id: LogicalId) =>
        this.find(working, entity, id),
      put: async <E extends EntityName>(record: LogicalRecord<E>) => {
        working.set(recordKey(record.entity, record.logicalId), record as AnyRecord);
      },
      delete: async (entity, id, hlc) => {
        working.set(
          recordKey(entity, id),
          {
            entity,
            logicalId: id,
            authorDevice: hlc.deviceId,
            hlc,
            deleted: true,
          } as AnyRecord,
        );
      },
      list: async <E extends EntityName>(
        entity: E,
        options?: { readonly includeDeleted?: boolean },
      ) =>
        this.listFrom(working, entity, options?.includeDeleted === true),
    };
    const result = await work(tx);
    this.records = working;
    return result;
  }

  private find<E extends EntityName>(
    records: Map<string, AnyRecord>,
    entity: E,
    id: LogicalId,
  ): LogicalRecord<E> | undefined {
    const record = records.get(recordKey(entity, id));
    return record?.entity === entity ? (record as LogicalRecord<E>) : undefined;
  }

  private listFrom<E extends EntityName>(
    records: Map<string, AnyRecord>,
    entity: E,
    includeDeleted: boolean,
  ): readonly LogicalRecord<E>[] {
    const result: LogicalRecord<E>[] = [];
    for (const record of records.values()) {
      if (record.entity === entity && (includeDeleted || !record.deleted)) {
        result.push(record as LogicalRecord<E>);
      }
    }
    return result;
  }
}
