import type { DeviceId } from '../../contracts/brand.ts';
import type {
  DayBundle,
  DayField,
  DayShareSelection,
  Hlc,
  PeriodOverride,
  TrackerValues,
} from '../../contracts/entities.ts';
import type { LocalDate, LocalDateRange } from '../../contracts/localdate.ts';
import type { Tracker } from '../../contracts/enums.ts';
import type { LogChange, LogRepo, LogicalRecord, RecordStore } from '../../contracts/store.ts';
import {
  listPortableRecords,
  logicalId,
  putEntity,
  repositoryClock,
  type PortableExportReader,
  type RepositoryOptions,
} from './common.ts';
import type { HlcClock } from './hlc.ts';

function overrideId(override: PeriodOverride) {
  return logicalId(JSON.stringify([override.localDate, override.kind]));
}

function contradictoryKind(kind: PeriodOverride['kind']): PeriodOverride['kind'] | undefined {
  if (kind === 'start') return 'not_start';
  if (kind === 'not_start') return 'start';
  return undefined;
}

export function createLogRepo(
  store: RecordStore,
  options: RepositoryOptions,
): LogRepo {
  const deviceId: DeviceId = options.deviceId;
  const clock: HlcClock = repositoryClock(options);
  const listeners = new Set<(change: LogChange) => void>();

  function publish(localDate: LocalDate): void {
    const change: LogChange = { localDates: [localDate] };
    for (const listener of [...listeners]) listener(change);
  }

  async function mutateDay(
    localDate: LocalDate,
    field: DayField,
    update: (bundle: DayBundle, stamp: Hlc) => DayBundle,
  ): Promise<void> {
    await store.transaction(async (tx) => {
      const id = logicalId(localDate);
      const previous = await tx.get('DayBundle', id);
      const bundle: DayBundle =
        previous && !previous.deleted
          ? previous.body
          : { localDate, fieldHlc: {} };
      const stamp = clock.tick([previous?.hlc, bundle.fieldHlc[field]]);
      const body = update(bundle, stamp);
      const record: LogicalRecord<'DayBundle'> = {
        entity: 'DayBundle',
        logicalId: id,
        authorDevice: deviceId,
        hlc: stamp,
        deleted: false,
        body,
      };
      await tx.put(record);
    });
    publish(localDate);
  }

  const repository: LogRepo & PortableExportReader = {
    async getDay(localDate) {
      const record = await store.get('DayBundle', logicalId(localDate));
      return record && !record.deleted ? record.body : undefined;
    },

    async listDays(range: LocalDateRange) {
      if (range.start > range.end) return [];
      const records = await store.list('DayBundle');
      const days: DayBundle[] = [];
      for (const record of records) {
        if (record.deleted) continue;
        const day = record.body;
        if (day.localDate >= range.start && day.localDate <= range.end) days.push(day);
      }
      return days.sort((left, right) =>
        left.localDate < right.localDate ? -1 : left.localDate > right.localDate ? 1 : 0,
      );
    },

    async setTracker<T extends Tracker>(localDate: LocalDate, tracker: T, value: TrackerValues[T]) {
      await mutateDay(localDate, tracker, (bundle, stamp) => ({
        ...bundle,
        [tracker]: value,
        fieldHlc: { ...bundle.fieldHlc, [tracker]: stamp },
      }) as DayBundle);
    },

    async clearTracker(localDate, tracker) {
      await mutateDay(localDate, tracker, (bundle, stamp) => {
        const cleared: DayBundle = {
          ...bundle,
          fieldHlc: { ...bundle.fieldHlc, [tracker]: stamp },
        };
        delete (cleared as Partial<TrackerValues>)[tracker];
        return cleared;
      });
    },

    async setShareSelection(localDate: LocalDate, selection: DayShareSelection) {
      await mutateDay(localDate, 'shareSelection', (bundle, stamp) => ({
        ...bundle,
        shareSelection: selection,
        fieldHlc: { ...bundle.fieldHlc, shareSelection: stamp },
      }));
    },

    async listOverrides() {
      const records = await store.list('PeriodOverride');
      return records
        .filter((record) => !record.deleted)
        .map((record) => record.body)
        .sort((left, right) => {
          if (left.localDate !== right.localDate) return left.localDate < right.localDate ? -1 : 1;
          return left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
        });
    },

    async putOverride(override: PeriodOverride) {
      await store.transaction(async (tx) => {
        const opposite = contradictoryKind(override.kind);
        if (opposite) {
          const oppositeId = overrideId({ localDate: override.localDate, kind: opposite });
          const previous = await tx.get('PeriodOverride', oppositeId);
          if (previous && !previous.deleted) {
            await tx.delete(
              'PeriodOverride',
              oppositeId,
              clock.tick([previous.hlc]),
            );
          }
        }
        await putEntity(
          tx,
          'PeriodOverride',
          overrideId(override),
          override,
          deviceId,
          clock,
        );
      });
      publish(override.localDate);
    },

    async removeOverride(override: PeriodOverride) {
      await store.transaction(async (tx) => {
        const id = overrideId(override);
        const previous = await tx.get('PeriodOverride', id);
        const stamp = clock.tick(previous ? [previous.hlc] : []);
        await tx.delete('PeriodOverride', id, stamp);
      });
      publish(override.localDate);
    },

    listPortableRecords() {
      return listPortableRecords(store);
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return repository;
}