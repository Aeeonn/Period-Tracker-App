import type { DeviceId, LogicalId } from '../../contracts/brand.ts';
import type { BackupMeta, ContraceptionState, DeviceIdentity, EntityMap, EntityName } from '../../contracts/entities.ts';
import type { SettingsRepo, RecordStore } from '../../contracts/store.ts';
import { liveBody, logicalId, putEntity, repositoryClock, type RepositoryOptions } from './common.ts';
import type { HlcClock } from './hlc.ts';

const PROFILE_ID = logicalId('profile');
const BACKUP_META_ID = logicalId('backup-meta');

function contraceptionId(state: ContraceptionState): LogicalId {
  // The contract has no separate id; method plus start date identifies a regimen.
  return logicalId(JSON.stringify([state.startDate, state.method]));
}

export function createSettingsRepo(store: RecordStore, options: RepositoryOptions): SettingsRepo {
  const deviceId: DeviceId = options.deviceId;
  const clock: HlcClock = repositoryClock(options);

  async function save<E extends EntityName>(
    entity: E,
    id: LogicalId,
    body: EntityMap[E],
  ): Promise<void> {
    await store.transaction((tx) => putEntity(tx, entity, id, body, deviceId, clock));
  }

  return {
    async getProfile() {
      return liveBody(store, 'Profile', PROFILE_ID);
    },

    async putProfile(profile) {
      await save('Profile', PROFILE_ID, profile);
    },

    async listContraception() {
      const records = await store.list('ContraceptionState');
      return records
        .filter((record) => !record.deleted)
        .map((record) => record.body)
        .sort((left, right) => {
          if (left.startDate !== right.startDate) return left.startDate < right.startDate ? -1 : 1;
          return left.method < right.method ? -1 : left.method > right.method ? 1 : 0;
        });
    },

    async putContraception(state) {
      await save('ContraceptionState', contraceptionId(state), state);
    },

    async listPregnancies() {
      const records = await store.list('PregnancyRecord');
      return records
        .filter((record) => !record.deleted)
        .map((record) => record.body)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    },

    async putPregnancy(record) {
      await save('PregnancyRecord', logicalId(record.id), record);
    },

    async listReminders() {
      const records = await store.list('ReminderRule');
      return records
        .filter((record) => !record.deleted)
        .map((record) => record.body)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    },

    async putReminder(rule) {
      await save('ReminderRule', logicalId(rule.id), rule);
    },

    async getBackupMeta(): Promise<BackupMeta> {
      return (await liveBody(store, 'BackupMeta', BACKUP_META_ID)) ?? {};
    },

    async getDeviceIdentity(): Promise<DeviceIdentity | undefined> {
      return liveBody(store, 'DeviceIdentity', logicalId(deviceId));
    },
  };
}
