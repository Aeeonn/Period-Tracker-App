import type { DeviceId, LogicalId } from '../../contracts/brand.ts';
import { PARTNER_BACKUP_EXCLUDED_ENTITIES } from '../../contracts/backup.ts';
import type { EntityMap, EntityName } from '../../contracts/entities.ts';
import { ENTITY_NAMES, ENTITY_RECORD_TYPE } from '../../contracts/store.ts';
import type {
  LogicalRecord,
  RecordStore,
  RecordTransaction,
} from '../../contracts/store.ts';
import { compareHlc, createHlcClock, type HlcClock } from './hlc.ts';

export interface RepositoryOptions {
  readonly deviceId: DeviceId;
  /** Optional clock source for deterministic repository tests. */
  readonly nowMs?: () => number;
  /** Share one clock between repositories writing to the same store. */
  readonly hlcClock?: HlcClock;
}

export interface PortableMergeResult {
  /** Imported records that have no local copy or have the newer HLC. */
  readonly newer: number;
  /** Imported records whose HLC is older or whose identical copy already exists. */
  readonly older: number;
  /** Equal HLCs with different content; the existing local record is retained. */
  readonly conflicts: number;
}

export interface PortableExportReader {
  /** Decrypted backup-eligible records, including tombstones and HLC metadata. */
  listPortableRecords(): Promise<readonly LogicalRecord[]>;
}

export interface PortableImportWriter {
  /** Atomic merge; dry runs compute the same summary without writing. */
  mergePortableRecords(
    records: readonly LogicalRecord[],
    options?: { readonly dryRun?: boolean },
  ): Promise<PortableMergeResult>;
}

export function repositoryClock(options: RepositoryOptions): HlcClock {
  return options.hlcClock ?? createHlcClock(options.deviceId, options.nowMs);
}

/** Logical IDs are encrypted by RecordStore; this cast adds no runtime data. */
export function logicalId(value: string): LogicalId {
  return value as LogicalId;
}

export async function liveBody<E extends EntityName>(
  store: RecordStore | RecordTransaction,
  entity: E,
  id: LogicalId,
): Promise<EntityMap[E] | undefined> {
  const record = await store.get(entity, id);
  return record && !record.deleted ? record.body : undefined;
}

export async function putEntity<E extends EntityName>(
  tx: RecordTransaction,
  entity: E,
  id: LogicalId,
  body: EntityMap[E],
  deviceId: DeviceId,
  clock: HlcClock,
): Promise<void> {
  const previous = await tx.get(entity, id);
  const record: LogicalRecord<E> = {
    entity,
    logicalId: id,
    authorDevice: deviceId,
    hlc: clock.tick(previous ? [previous.hlc] : []),
    deleted: false,
    body,
  } as LogicalRecord<E>;
  await tx.put(record);
}

function isExcludedFromPortableExport(entity: EntityName): boolean {
  return (
    ENTITY_RECORD_TYPE[entity] === 'proj' ||
    PARTNER_BACKUP_EXCLUDED_ENTITIES.some((excluded) => excluded === entity)
  );
}

export async function listPortableRecords(store: RecordStore): Promise<readonly LogicalRecord[]> {
  const records: LogicalRecord[] = [];
  for (const entity of ENTITY_NAMES) {
    if (isExcludedFromPortableExport(entity)) continue;
    records.push(...(await store.list(entity, { includeDeleted: true })));
  }
  return records.sort((left, right) => {
    if (left.entity !== right.entity) return left.entity < right.entity ? -1 : 1;
    return left.logicalId < right.logicalId ? -1 : left.logicalId > right.logicalId ? 1 : 0;
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function assertMergeableRecords(records: readonly LogicalRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (isExcludedFromPortableExport(record.entity)) {
      throw new TypeError(`The ${record.entity} entity cannot be imported from a portable file.`);
    }
    const key = `${record.entity}\u0000${record.logicalId}`;
    if (seen.has(key)) throw new TypeError('A portable file contains duplicate record keys.');
    seen.add(key);
  }
}

export async function mergePortableRecords(
  store: RecordStore,
  incoming: readonly LogicalRecord[],
  options: { readonly dryRun?: boolean } = {},
): Promise<PortableMergeResult> {
  assertMergeableRecords(incoming);
  const dryRun = options.dryRun === true;
  return store.transaction(async (tx) => {
    let newer = 0;
    let older = 0;
    let conflicts = 0;
    for (const record of incoming) {
      const current = await tx.get(record.entity, record.logicalId);
      if (current === undefined || compareHlc(record.hlc, current.hlc) > 0) {
        newer += 1;
        if (!dryRun) await tx.put(record);
        continue;
      }
      if (compareHlc(record.hlc, current.hlc) < 0) {
        older += 1;
        continue;
      }
      if (canonicalJson(record) !== canonicalJson(current)) conflicts += 1;
      else older += 1;
    }
    return { newer, older, conflicts };
  });
}