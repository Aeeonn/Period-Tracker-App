import { describe, expect, it } from 'vitest';
import type { DeviceId, LogicalId } from '../../../src/contracts/brand.ts';
import type { CoupleEntry, Hlc, Profile } from '../../../src/contracts/entities.ts';
import type { EntityName } from '../../../src/contracts/entities.ts';
import type {
  LogRepo,
  LogicalRecord,
  RecordStore,
  RecordTransaction,
  SettingsRepo,
} from '../../../src/contracts/store.ts';
import {
  createLogRepo,
  createSettingsRepo,
  type PortableExportReader,
  type PortableImportWriter,
} from '../../../src/data/repos/index.ts';
import { MemoryRecordStore } from './memory-record-store.ts';

const ownDevice = 'synthetic-own-device' as DeviceId;
const otherDevice = 'synthetic-other-device' as DeviceId;

function stamp(wallMs: number, deviceId = ownDevice): Hlc {
  return { wallMs, counter: 0, deviceId };
}

function profileBody(theme: Profile['theme'] = 'light'): Profile {
  return {
    goal: 'track',
    lifeStage: 'cycle',
    units: { temp: 'celsius', weight: 'kg' },
    weekStart: 1,
    theme,
    lockTimeoutSec: 300,
    quickHideEnabled: false,
  };
}

function profileRecord(
  id: string,
  wallMs: number,
  theme: Profile['theme'] = 'light',
): LogicalRecord<'Profile'> {
  return {
    entity: 'Profile',
    logicalId: id as LogicalId,
    authorDevice: ownDevice,
    hlc: stamp(wallMs),
    deleted: false,
    body: profileBody(theme),
  };
}

function coupleRecord(
  id: string,
  recordAuthor: DeviceId,
  bodyAuthor: DeviceId,
): LogicalRecord<'CoupleEntry'> {
  return {
    entity: 'CoupleEntry',
    logicalId: id as LogicalId,
    authorDevice: recordAuthor,
    hlc: stamp(30, recordAuthor),
    deleted: false,
    body: {
      id: id as CoupleEntry['id'],
      authorDeviceId: bodyAuthor,
      kind: 'note',
      localDate: '2034-05-06' as CoupleEntry['localDate'],
      fields: { text: 'synthetic couple note' },
      hlc: stamp(30, recordAuthor),
    },
  };
}

function asRecord<E extends EntityName>(
  entity: E,
  id: string,
  author: DeviceId,
  hlc: Hlc,
): LogicalRecord {
  return {
    entity,
    logicalId: id as LogicalId,
    authorDevice: author,
    hlc,
    deleted: true,
  } as LogicalRecord;
}

class FailingSecondPutStore implements RecordStore {
  constructor(private readonly inner: MemoryRecordStore) {}

  get<E extends EntityName>(entity: E, id: LogicalId) {
    return this.inner.get(entity, id);
  }

  put<E extends EntityName>(record: LogicalRecord<E>) {
    return this.inner.put(record);
  }

  delete(entity: EntityName, id: LogicalId, hlc: Hlc) {
    return this.inner.delete(entity, id, hlc);
  }

  list<E extends EntityName>(entity: E, options?: { readonly includeDeleted?: boolean }) {
    return this.inner.list(entity, options);
  }

  transaction<R>(work: (tx: RecordTransaction) => Promise<R>): Promise<R> {
    return this.inner.transaction(async (tx) => {
      let puts = 0;
      const failingTx: RecordTransaction = {
        get: (entity, id) => tx.get(entity, id),
        put: async (record) => {
          puts += 1;
          if (puts === 2) throw new Error('synthetic second-write failure');
          await tx.put(record);
        },
        delete: (entity, id, hlc) => tx.delete(entity, id, hlc),
        list: (entity, options) => tx.list(entity, options),
      };
      return work(failingTx);
    });
  }
}

describe('portable repository primitives', () => {
  it('returns decrypted export records with HLCs and tombstones but never projections or keys', async () => {
    const store = new MemoryRecordStore();
    store.seed(profileRecord('profile', 10));
    store.seed(coupleRecord('own-entry', ownDevice, ownDevice));
    store.seed(coupleRecord('other-entry', otherDevice, otherDevice));
    store.seed(asRecord('DayBundle', '2034-05-06', ownDevice, stamp(40)));
    store.seed({
      entity: 'Projection',
      logicalId: 'projection-canary' as LogicalId,
      authorDevice: otherDevice,
      hlc: stamp(50, otherDevice),
      deleted: false,
      body: { canary: 'synthetic projection secret' },
    } as unknown as LogicalRecord<'Projection'>);
    store.seed({
      entity: 'ShareEpochKey',
      logicalId: 'category-key-canary' as LogicalId,
      authorDevice: ownDevice,
      hlc: stamp(60),
      deleted: false,
      body: { canary: 'synthetic category key' },
    } as unknown as LogicalRecord<'ShareEpochKey'>);

    const repo = createLogRepo(store, { deviceId: ownDevice }) as LogRepo & PortableExportReader;
    const records = await repo.listPortableRecords();

    expect(records.map(({ entity, logicalId, deleted }) => [entity, logicalId, deleted])).toEqual([
      ['CoupleEntry', 'other-entry', false],
      ['CoupleEntry', 'own-entry', false],
      ['DayBundle', '2034-05-06', true],
      ['Profile', 'profile', false],
    ]);
    expect(records.find((record) => record.logicalId === 'profile' as LogicalId)?.hlc).toEqual(stamp(10));
    expect(
      records.find(
        (record) => record.entity === 'CoupleEntry' && record.logicalId === ('other-entry' as LogicalId),
      ),
    ).toMatchObject({
      deleted: false,
      body: { fields: { text: 'synthetic couple note' } },
    });
    expect(JSON.stringify(records)).not.toContain('synthetic projection secret');
    expect(JSON.stringify(records)).not.toContain('synthetic category key');
  });

  it('previews without writes and applies only strictly newer HLC records with their original metadata', async () => {
    const store = new MemoryRecordStore();
    const local = profileRecord('same-key', 20, 'dark');
    store.seed(local);
    const localOlderKey = profileRecord('older-key', 20, 'dark');
    store.seed(localOlderKey);
    const incomingNewer = profileRecord('same-key', 30, 'light');
    const incomingOlder = profileRecord('older-key', 10, 'system');
    const incomingNew = profileRecord('new-key', 15, 'light');
    const repo = createSettingsRepo(store, { deviceId: ownDevice }) as SettingsRepo & PortableImportWriter;

    const preview = await repo.mergePortableRecords([incomingNewer, incomingOlder, incomingNew], {
      dryRun: true,
    });
    expect(preview).toEqual({ newer: 2, older: 1, conflicts: 0 });
    expect(store.inspect('Profile', local.logicalId)).toEqual(local);
    expect(store.inspect('Profile', localOlderKey.logicalId)).toEqual(localOlderKey);
    expect(store.inspect('Profile', incomingNew.logicalId)).toBeUndefined();

    const applied = await repo.mergePortableRecords([incomingNewer, incomingOlder, incomingNew]);
    expect(applied).toEqual(preview);
    expect(store.inspect('Profile', local.logicalId)).toEqual(incomingNewer);
    expect(store.inspect('Profile', incomingNew.logicalId)).toEqual(incomingNew);
    expect(store.inspect('Profile', incomingNew.logicalId)?.authorDevice).toBe(ownDevice);
    expect(store.inspect('Profile', incomingNew.logicalId)?.hlc).toEqual(stamp(15));
    expect(store.inspect('Profile', localOlderKey.logicalId)).toEqual(localOlderKey);
  });

  it('retains the local record on an equal-HLC conflict and rejects protected or duplicate input', async () => {
    const store = new MemoryRecordStore();
    const local = profileRecord('same-key', 20, 'dark');
    store.seed(local);
    const collision = { ...local, body: profileBody('light') };
    const repo = createSettingsRepo(store, { deviceId: ownDevice }) as SettingsRepo & PortableImportWriter;

    await expect(repo.mergePortableRecords([collision])).resolves.toEqual({
      newer: 0,
      older: 0,
      conflicts: 1,
    });
    expect(store.inspect('Profile', local.logicalId)).toEqual(local);
    await expect(
      repo.mergePortableRecords([
        {
          entity: 'Projection',
          logicalId: 'blocked' as LogicalId,
          authorDevice: ownDevice,
          hlc: stamp(30),
          deleted: true,
        } as LogicalRecord,
      ]),
    ).rejects.toThrow('cannot be imported');
    await expect(repo.mergePortableRecords([local, local])).rejects.toThrow('duplicate record keys');
  });

  it('rolls back every staged record when a later write fails', async () => {
    const memory = new MemoryRecordStore();
    const failingStore = new FailingSecondPutStore(memory);
    const repo = createSettingsRepo(failingStore, { deviceId: ownDevice }) as SettingsRepo & PortableImportWriter;

    await expect(
      repo.mergePortableRecords([profileRecord('first', 10), profileRecord('second', 20)]),
    ).rejects.toThrow('synthetic second-write failure');
    expect(memory.inspect('Profile', 'first' as LogicalId)).toBeUndefined();
    expect(memory.inspect('Profile', 'second' as LogicalId)).toBeUndefined();
  });
});