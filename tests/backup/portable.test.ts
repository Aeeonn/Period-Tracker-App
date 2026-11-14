import { describe, expect, it } from 'vitest';
import type { DeviceId, LogicalId } from '../../src/contracts/brand.ts';
import type {
  CoupleEntry,
  DayBundle,
  DeviceIdentity,
  Hlc,
  Profile,
  ReminderRule,
} from '../../src/contracts/entities.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import type { OpenRecordStore } from '../../src/data/store/store.ts';
import { ensureDeviceIdentity } from '../../src/app/device-identity.ts';
import { createLogRepo, createSettingsRepo } from '../../src/data/repos/index.ts';
import { logicalId } from '../../src/data/repos/common.ts';
import { SCHEMA_VERSION } from '../../src/data/store/schema.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';
import {
  createPortableBackupService,
  type PortableBackupRepositories,
} from '../../src/backup/portable/service.ts';
import { contentCardId } from '../../src/content/cards/core/types.ts';
import {
  createPortableDocument,
  createTrackerCsv,
  parsePortableFile,
} from '../../src/backup/portable/codec.ts';
import { MemoryRecordStore } from '../data/repos/memory-record-store.ts';

const ownDevice = 'synthetic-export-device' as DeviceId;
const remoteDevice = 'synthetic-remote-device' as DeviceId;
const initializedDevice = '123e4567-e89b-42d3-a456-426614174000' as DeviceId;
const foreignDevice = '223e4567-e89b-42d3-a456-426614174000' as DeviceId;

function stamp(wallMs: number, deviceId = ownDevice): Hlc {
  return { wallMs, counter: 0, deviceId };
}

function profile(theme: Profile['theme'] = 'light'): Profile {
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

function identityRecord(
  deviceId: DeviceId,
  role: DeviceIdentity['role'],
): LogicalRecord<'DeviceIdentity'> {
  const identity: DeviceIdentity = {
    deviceId,
    role,
    signPub: `synthetic-signing-key-${deviceId}` as DeviceIdentity['signPub'],
    agreePub: `synthetic-agreement-key-${deviceId}` as DeviceIdentity['agreePub'],
    displayName: `Synthetic ${role}`,
    createdAt: '2024-01-01T09:00' as DeviceIdentity['createdAt'],
  };
  return {
    entity: 'DeviceIdentity',
    logicalId: logicalId(deviceId),
    authorDevice: deviceId,
    hlc: stamp(1, deviceId),
    deleted: false,
    body: identity,
  };
}

function profileRecord(body: Profile): LogicalRecord<'Profile'> {
  return {
    entity: 'Profile',
    logicalId: logicalId('profile'),
    authorDevice: ownDevice,
    hlc: stamp(2),
    deleted: false,
    body,
  };
}

function seedIdentity(
  store: MemoryRecordStore,
  deviceId: DeviceId,
  role: DeviceIdentity['role'],
): void {
  store.seed(identityRecord(deviceId, role));
}

class OpenMemoryRecordStore extends MemoryRecordStore implements OpenRecordStore {
  readonly status = 'READY' as const;
  readonly schemaVersion = 1;
  readonly databaseVersion = 1;
  readonly readOnly = false;

  close(): void {}
}

function repositories(store: MemoryRecordStore, deviceId: DeviceId): PortableBackupRepositories {
  return {
    logRepo: createLogRepo(store, { deviceId }),
    settingsRepo: createSettingsRepo(store, { deviceId }),
  };
}

function dayRecord(
  localDate: string,
  index: number,
  notes?: string,
): Extract<LogicalRecord<'DayBundle'>, { readonly deleted: false }> {
  const day = localDate as DayBundle['localDate'];
  const hlc = stamp(10_000 + index);
  return {
    entity: 'DayBundle',
    logicalId: day as unknown as LogicalId,
    authorDevice: ownDevice,
    hlc,
    deleted: false,
    body: {
      localDate: day,
      flow: index % 2 === 0 ? 'light' : 'medium',
      ...(notes === undefined ? {} : { notes }),
      fieldHlc: { flow: hlc, ...(notes === undefined ? {} : { notes: hlc }) },
    },
  };
}

function coupleRecord(
  id: string,
  recordAuthor: DeviceId,
  entryAuthor: DeviceId,
  text: string,
): LogicalRecord<'CoupleEntry'> {
  return {
    entity: 'CoupleEntry',
    logicalId: id as LogicalId,
    authorDevice: recordAuthor,
    hlc: stamp(20, recordAuthor),
    deleted: false,
    body: {
      id: id as CoupleEntry['id'],
      authorDeviceId: entryAuthor,
      kind: 'note',
      localDate: '2024-02-01' as CoupleEntry['localDate'],
      fields: { text },
      hlc: stamp(20, recordAuthor),
    },
  };
}

function parseJson(file: Blob): Promise<unknown> {
  return file.text().then((text) => JSON.parse(text) as unknown);
}

describe('portable export and import', () => {
  it('round-trips recent card display history in a Profile record', async () => {
    const shownOn = parse('2024-01-02');
    if (!shownOn) throw new Error('Invalid synthetic card display LocalDate');
    const source = new MemoryRecordStore();
    seedIdentity(source, ownDevice, 'owner');
    source.seed(
      profileRecord({
        ...profile(),
        recentContentCards: [{ cardId: contentCardId('cycle-basics'), shownOn }],
      }),
    );

    const exported = await createPortableBackupService(
      repositories(source, ownDevice),
    ).exportJson();
    const restored = new MemoryRecordStore();
    seedIdentity(restored, ownDevice, 'owner');
    const service = createPortableBackupService(repositories(restored, ownDevice));
    const result = await service.importJson(
      new Blob([await exported.file.text()], { type: 'application/json' }),
      { dryRun: false },
    );

    expect(result).toMatchObject({ ok: true, applied: true });
    const restoredProfiles = await restored.list('Profile');
    const restoredProfile = restoredProfiles.find((record) => !record.deleted);
    if (!restoredProfile || restoredProfile.deleted) {
      throw new Error('Portable profile with card history was not restored.');
    }
    expect(restoredProfile.body).toMatchObject({
      recentContentCards: [{ cardId: 'cycle-basics', shownOn: '2024-01-02' }],
    });
  });

  it('round-trips a synthetic two-year dataset through JSON and emits a per-tracker CSV', async () => {
    const source = new MemoryRecordStore();
    seedIdentity(source, ownDevice, 'owner');
    const start = parse('2024-01-01');
    if (!start) throw new Error('Invalid synthetic start LocalDate');
    for (let index = 0; index < 730; index += 1) {
      source.seed(dayRecord(addDays(start, index), index));
    }

    const sourceService = createPortableBackupService(repositories(source, ownDevice));
    const exported = await sourceService.exportJson();
    const document = (await parseJson(exported.file)) as {
      readonly schemaVersion: number;
      readonly engineVersion: string;
      readonly records: readonly LogicalRecord[];
    };
    expect(exported.fileName).toBe('data-export.json');
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.engineVersion).toMatch(/^cycle-engine\//u);
    expect(document.records).toHaveLength(730);
    expect(document.records.every((record) => record.entity === 'DayBundle')).toBe(true);

    const restored = new MemoryRecordStore();
    const restoredService = createPortableBackupService(repositories(restored, ownDevice));
    const blob = new Blob([await exported.file.text()], { type: 'application/json' });
    const preview = await restoredService.importJson(blob, { dryRun: true });
    expect(preview).toMatchObject({
      ok: true,
      applied: false,
      summary: { newer: 730, skippedDeviceIdentities: 0 },
    });
    expect(await restored.list('DayBundle')).toHaveLength(0);
    const result = await restoredService.importJson(blob, { dryRun: false });
    expect(result).toMatchObject({
      ok: true,
      applied: true,
      summary: { newer: 730, skippedDeviceIdentities: 0 },
    });

    const restoredExport = await restoredService.exportJson();
    expect(await parseJson(restoredExport.file)).toEqual(document);
    const csv = await sourceService.exportCsv('flow');
    expect(csv.fileName).toBe('data-export-flow.csv');
    expect(csv.file.type).toContain('text/csv');
    expect((await csv.file.text()).match(/\r\n/gu)).toHaveLength(731);
  });

  it('skips foreign device identities from older exports and preserves the local identity after import', async () => {
    const store = new OpenMemoryRecordStore();
    seedIdentity(store, initializedDevice, 'owner');
    const day = dayRecord('2024-02-02', 2);
    const legacy = createPortableDocument(
      [identityRecord(foreignDevice, 'owner'), day],
      SCHEMA_VERSION,
    );
    const file = new Blob([JSON.stringify(legacy)], { type: 'application/json' });
    const service = createPortableBackupService(repositories(store, initializedDevice));

    const preview = await service.importJson(file, { dryRun: true });
    expect(preview).toMatchObject({
      ok: true,
      applied: false,
      summary: {
        countsByEntity: { DayBundle: 1 },
        skippedDeviceIdentities: 1,
        newer: 1,
      },
    });
    expect(await store.list('DeviceIdentity')).toHaveLength(1);
    expect(await store.list('DayBundle')).toHaveLength(0);

    await expect(service.importJson(file, { dryRun: false })).resolves.toMatchObject({
      ok: true,
      applied: true,
      summary: { skippedDeviceIdentities: 1, newer: 1 },
    });
    await expect(ensureDeviceIdentity(store)).resolves.toBe(initializedDevice);
    expect(await store.list('DeviceIdentity')).toHaveLength(1);
    expect(await store.list('DayBundle')).toEqual([day]);
  });

  it('rejects malformed, partial, and newer-schema files without writing any records', async () => {
    const store = new MemoryRecordStore();
    seedIdentity(store, ownDevice, 'owner');
    const service = createPortableBackupService(repositories(store, ownDevice));
    const malformed = new Blob(['not json'], { type: 'application/json' });
    await expect(service.importJson(malformed, { dryRun: false })).resolves.toEqual({
      ok: false,
      error: 'invalid_file',
    });
    expect(await store.get('Profile', 'profile' as LogicalId)).toBeUndefined();

    const future = new Blob([
      JSON.stringify({
        format: 'flo-portable-data',
        schemaVersion: SCHEMA_VERSION + 1,
        engineVersion: 'cycle-engine/future',
        records: [
          {
            entity: 'Profile',
            logicalId: 'profile',
            authorDevice: ownDevice,
            hlc: stamp(39),
            deleted: false,
            body: profile('dark'),
          },
        ],
      }),
    ]);
    await expect(service.importJson(future, { dryRun: false })).resolves.toEqual({
      ok: false,
      error: 'newer_schema',
    });
    expect(await store.get('Profile', 'profile' as LogicalId)).toBeUndefined();

    const validFirst = {
      entity: 'Profile',
      logicalId: 'profile',
      authorDevice: ownDevice,
      hlc: stamp(40),
      deleted: false,
      body: profile('dark'),
    };
    const invalidSecond = {
      entity: 'PeriodOverride',
      logicalId: 'bad-date',
      authorDevice: ownDevice,
      hlc: stamp(41),
      deleted: false,
      body: { localDate: '2034-02-30', kind: 'start' },
    };
    const partial = new Blob([
      JSON.stringify({
        format: 'flo-portable-data',
        schemaVersion: SCHEMA_VERSION,
        engineVersion: 'cycle-engine/synthetic',
        records: [validFirst, invalidSecond],
      }),
    ]);
    await expect(service.importJson(partial, { dryRun: false })).resolves.toEqual({
      ok: false,
      error: 'invalid_file',
    });
    expect(await store.get('Profile', 'profile' as LogicalId)).toBeUndefined();
    expect(await store.list('PeriodOverride', { includeDeleted: true })).toHaveLength(0);
  });

  it('keeps partner exports free of her shared data and includes the readable couple space', async () => {
    const store = new MemoryRecordStore();
    seedIdentity(store, ownDevice, 'partner');
    store.seed({
      entity: 'Profile',
      logicalId: 'profile' as LogicalId,
      authorDevice: ownDevice,
      hlc: stamp(2),
      deleted: false,
      body: profile(),
    });
    const reminder: ReminderRule = {
      id: 'synthetic-reminder' as ReminderRule['id'],
      kind: 'daily_symptom_log',
      localTime: '09:00' as ReminderRule['localTime'],
      days: [1, 3, 5],
      condition: 'always',
      enabled: true,
    };
    store.seed({
      entity: 'ReminderRule',
      logicalId: reminder.id as unknown as LogicalId,
      authorDevice: ownDevice,
      hlc: stamp(3),
      deleted: false,
      body: reminder,
    });
    store.seed(dayRecord('2024-02-02', 2, 'synthetic private tracker canary'));
    store.seed(coupleRecord('own-couple-entry', ownDevice, ownDevice, 'synthetic own entry'));
    store.seed(
      coupleRecord(
        'other-couple-entry',
        remoteDevice,
        remoteDevice,
        'synthetic other entry canary',
      ),
    );
    store.seed({
      entity: 'Projection',
      logicalId: 'projection-canary' as LogicalId,
      authorDevice: remoteDevice,
      hlc: stamp(4, remoteDevice),
      deleted: false,
      body: { canary: 'synthetic projection plaintext canary' },
    } as unknown as LogicalRecord<'Projection'>);
    store.seed({
      entity: 'ShareEpochKey',
      logicalId: 'share-key-canary' as LogicalId,
      authorDevice: ownDevice,
      hlc: stamp(5),
      deleted: false,
      body: { canary: 'synthetic category key canary' },
    } as unknown as LogicalRecord<'ShareEpochKey'>);

    const service = createPortableBackupService(repositories(store, ownDevice));
    const jsonFile = await service.exportJson();
    const json = await jsonFile.file.text();
    const document = JSON.parse(json) as { readonly records: readonly LogicalRecord[] };
    expect(document.records.map((record) => record.entity)).toEqual([
      'CoupleEntry',
      'CoupleEntry',
      'Profile',
      'ReminderRule',
    ]);
    expect(json).toContain('synthetic own entry');
    expect(json).toContain('synthetic other entry canary');
    expect(json).not.toContain('synthetic private tracker canary');
    expect(json).not.toContain('projection-canary');
    expect(json).not.toContain('share-key-canary');

    const csv = await service.exportCsv('notes');
    const csvText = await csv.file.text();
    expect(csvText).not.toContain('synthetic private tracker canary');
    expect(csvText).not.toContain('synthetic projection plaintext canary');
    expect(csvText).not.toContain('share-key-canary');
  });

  it('quotes CSV delimiters and neutralizes all specified formula prefixes', async () => {
    const store = new MemoryRecordStore();
    seedIdentity(store, ownDevice, 'owner');
    const start = parse('2036-01-01');
    if (!start) throw new Error('Invalid synthetic CSV LocalDate');
    const formulas = ['=SUM(1,2)\n"synthetic"', '+2', '-3', '@SUM(1,2)', '\t=1', '\r=2'];
    formulas.forEach((value, index) => {
      const day = addDays(start, index);
      store.seed(dayRecord(day, index, value));
    });

    const service = createPortableBackupService(repositories(store, ownDevice));
    const csvFile = await service.exportCsv('notes');
    const csv = await csvFile.file.text();
    expect(csv).toContain('"localDate","tracker","value"');
    expect(csv).toContain('"\'=SUM(1,2)\n""synthetic"""');
    for (const formula of formulas.slice(1)) {
      expect(csv).toContain(`"'${formula}"`);
    }
  });

  it('parses valid JSON and rejects malformed, stale, duplicate, and invalid records', async () => {
    const record = dayRecord('2036-01-01', 1, 'synthetic backup fixture');
    const document = createPortableDocument([record], SCHEMA_VERSION);
    const valid = await parsePortableFile(
      new Blob([JSON.stringify(document)], { type: 'application/json' }),
      SCHEMA_VERSION,
    );
    expect(valid).toEqual({ ok: true, document });

    const invalidDate = {
      ...record,
      body: { ...record.body, localDate: '2036-02-30' },
    } as unknown as LogicalRecord;
    const invalidId = { ...record, logicalId: '' } as LogicalRecord;
    const duplicate = createPortableDocument([record, record], SCHEMA_VERSION);
    const wrongFormat = { ...document, format: 'synthetic-wrong-format' };
    const stale = { ...document, schemaVersion: SCHEMA_VERSION - 1 };
    const future = { ...document, schemaVersion: SCHEMA_VERSION + 1 };

    for (const candidate of [
      duplicate,
      wrongFormat,
      stale,
      createPortableDocument([invalidDate], SCHEMA_VERSION),
      createPortableDocument([invalidId], SCHEMA_VERSION),
    ]) {
      await expect(
        parsePortableFile(new Blob([JSON.stringify(candidate)]), SCHEMA_VERSION),
      ).resolves.toEqual({ ok: false, error: 'invalid_file' });
    }
    await expect(parsePortableFile(new Blob(['{']), SCHEMA_VERSION)).resolves.toEqual({
      ok: false,
      error: 'invalid_file',
    });
    await expect(
      parsePortableFile(new Blob([JSON.stringify(future)]), SCHEMA_VERSION),
    ).resolves.toEqual({ ok: false, error: 'newer_schema' });
  });

  it('filters non-day, deleted, and absent tracker rows while serializing non-string values', () => {
    const base = dayRecord('2036-02-01', 1);
    const numeric = {
      ...base,
      body: { ...base.body, weight: 56.5 },
    } as unknown as LogicalRecord;
    const deleted = { ...base, deleted: true } as LogicalRecord;
    const otherEntity = {
      ...base,
      entity: 'PeriodOverride',
    } as unknown as LogicalRecord;

    expect(createTrackerCsv([base, numeric, deleted, otherEntity], 'weight')).toBe(
      '"localDate","tracker","value"\r\n"2036-02-01","weight","56.5"\r\n',
    );
    expect(createTrackerCsv([base], 'mood')).toBe('"localDate","tracker","value"\r\n');
  });
});
