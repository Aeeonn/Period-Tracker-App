import type { DeviceId, LogicalId } from '../../contracts/brand.ts';
import type { EntityMap, EntityName } from '../../contracts/entities.ts';
import type {
  LogicalRecord,
  RecordStore,
  RecordTransaction,
} from '../../contracts/store.ts';
import { createHlcClock, type HlcClock } from './hlc.ts';

export interface RepositoryOptions {
  readonly deviceId: DeviceId;
  /** Optional clock source for deterministic repository tests. */
  readonly nowMs?: () => number;
  /** Share one clock between repositories writing to the same store. */
  readonly hlcClock?: HlcClock;
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
