import { describe, expect, it } from 'vitest';
import type { DeviceId, LogicalId } from '../../src/contracts/brand.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import {
  ACTIVITY_TYPE,
  BBT_DISTURBANCE,
  CONTRACEPTION_METHODS,
  CONSENT_ACTIONS,
  COUPLE_ENTRY_KINDS,
  DESIRE,
  DISCHARGE,
  DEVICE_ROLES,
  EDD_SOURCES,
  EMERGENCY_CONTRACEPTION,
  FLOW,
  GOALS,
  HEAVY_DETAIL,
  ISO_WEEKDAYS,
  LIFE_STAGES,
  LH_TEST_RESULT,
  LOCHIA,
  MOOD,
  OVULATION_MANUAL,
  PERI_IMPACT_ITEMS,
  PERIOD_OVERRIDE_KINDS,
  PERIOD_PAIN,
  PILL_INTAKE,
  PREGNANCY_OUTCOMES,
  PREGNANCY_TEST_RESULT,
  REMINDER_CONDITIONS,
  REMINDER_KINDS,
  SEX_ACTIVITY,
  SEX_BLEEDING_AFTER,
  SEX_COMFORT,
  SEX_PROTECTION,
  SEX_SATISFACTION,
  SHARE_CATEGORIES,
  SHARE_STATES,
  STRESS,
  STI_TEST_RESULT,
  SYMPTOMS_BODY,
  TEMPERATURE_UNITS,
  THEMES,
  TRACKERS,
  WEIGHT_UNITS,
  ZERO_TO_THREE,
} from '../../src/contracts/enums.ts';
import { SCHEMA_VERSION } from '../../src/data/store/schema.ts';
import { createPortableDocument, parsePortableFile } from '../../src/backup/portable/codec.ts';

const DEVICE_ID = 'synthetic-portable-validation-device' as DeviceId;
const syntheticHlc = { wallMs: 1_800_000_000_000, counter: 0, deviceId: DEVICE_ID };

function record(
  entity: LogicalRecord['entity'],
  logicalId: string,
  body: unknown,
): LogicalRecord {
  return {
    entity,
    logicalId: logicalId as LogicalId,
    authorDevice: DEVICE_ID,
    hlc: syntheticHlc,
    deleted: false,
    body,
  } as LogicalRecord;
}

function fullDayBody(): Record<string, unknown> {
  return {
    localDate: '2038-01-02',
    fieldHlc: { flow: syntheticHlc, shareSelection: syntheticHlc },
    shareSelection: {
      symptoms_body: [SYMPTOMS_BODY[0]],
      mood: [MOOD[0]],
    },
    flow: FLOW[0],
    heavy_detail: [HEAVY_DETAIL[0]],
    period_pain: PERIOD_PAIN[0],
    discharge: DISCHARGE[0],
    symptoms_body: [SYMPTOMS_BODY[0]],
    mood: [MOOD[0]],
    energy: ZERO_TO_THREE[0],
    stress: STRESS[0],
    desire: DESIRE[0],
    sex: [
      {
        activity: [SEX_ACTIVITY[0]],
        protection: [SEX_PROTECTION[0]],
        comfort: SEX_COMFORT[0],
        satisfaction: SEX_SATISFACTION[0],
        bleeding_after: SEX_BLEEDING_AFTER[0],
      },
    ],
    tests: {
      pregnancy: PREGNANCY_TEST_RESULT[0],
      lh: LH_TEST_RESULT[0],
      sti: { taken: true, result: STI_TEST_RESULT[0] },
      emergency_contraception: EMERGENCY_CONTRACEPTION[0],
    },
    bbt: {
      valueC: 36.55,
      measuredAt: '08:15',
      disturbances: [BBT_DISTURBANCE[0]],
    },
    ovulation_manual: OVULATION_MANUAL[0],
    pill_intake: PILL_INTAKE[0],
    medication: [{ name: 'Synthetic supplement', taken: true }],
    weight: 60.5,
    water: 2000,
    sleep: { hours: 7, quality: ZERO_TO_THREE[2] },
    activity: { minutes: 30, type: ACTIVITY_TYPE[0] },
    alcohol: 0,
    notes: 'synthetic portable validation note',
    peri_impact: Object.fromEntries(PERI_IMPACT_ITEMS.map((item) => [item, 1])),
    lochia: LOCHIA[0],
  };
}

function supportedRecords(): LogicalRecord[] {
  return [
    record('DeviceIdentity', 'device', {
      deviceId: DEVICE_ID,
      role: DEVICE_ROLES[0],
      signPub: 'synthetic-signing-key',
      agreePub: 'synthetic-agreement-key',
      displayName: 'Synthetic device',
      createdAt: '2038-01-02T09:00',
    }),
    record('Profile', 'profile', {
      goal: GOALS[0],
      lifeStage: LIFE_STAGES[0],
      units: { temp: TEMPERATURE_UNITS[0], weight: WEIGHT_UNITS[0] },
      weekStart: ISO_WEEKDAYS[0],
      theme: THEMES[0],
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    }),
    record('DayBundle', 'day', fullDayBody()),
    record('PeriodOverride', 'period-override', {
      localDate: '2038-01-03',
      kind: PERIOD_OVERRIDE_KINDS[0],
    }),
    record('ContraceptionState', 'contraception', {
      method: CONTRACEPTION_METHODS[0],
      startDate: '2038-01-01',
      regimen: { activeDays: 21, breakDays: 7, continuous: false },
    }),
    record('PregnancyRecord', 'pregnancy', {
      id: 'synthetic-pregnancy',
      eddSource: EDD_SOURCES[0],
      fetusCount: 1,
      outcome: PREGNANCY_OUTCOMES[0],
    }),
    record('ReminderRule', 'reminder', {
      id: 'synthetic-reminder',
      kind: REMINDER_KINDS[0],
      localTime: '09:00',
      days: [ISO_WEEKDAYS[0]],
      condition: REMINDER_CONDITIONS[0],
      enabled: true,
    }),
    record('ShareSetting', 'share-setting', {
      category: SHARE_CATEGORIES[0],
      state: SHARE_STATES[0],
      epoch: 0,
      startDate: '2038-01-01',
      updatedHlc: syntheticHlc,
    }),
    record('CoupleEntry', 'couple-note', {
      id: 'synthetic-couple-note',
      authorDeviceId: DEVICE_ID,
      kind: COUPLE_ENTRY_KINDS[2],
      localDate: '2038-01-02',
      fields: { text: 'synthetic couple-space note' },
      hlc: syntheticHlc,
    }),
    record('CoupleEntry', 'couple-date', {
      id: 'synthetic-couple-date',
      authorDeviceId: DEVICE_ID,
      kind: COUPLE_ENTRY_KINDS[0],
      localDate: '2038-01-02',
      fields: {},
      hlc: syntheticHlc,
    }),
    record('CoupleFlag', 'couple-flag', {
      entryId: 'synthetic-couple-note',
      allowInHerInsights: false,
    }),
    record('PredictionSnapshot', 'prediction', {
      engineVersion: 'cycle-engine/synthetic',
      paramsHash: 'synthetic-params',
      madeOn: '2038-01-02',
      center: '2038-01-15',
      lo: '2038-01-12',
      hi: '2038-01-18',
      actualStart: '2038-01-16',
    }),
    record('ConsentEvent', 'consent', {
      at: '2038-01-02T09:00',
      action: CONSENT_ACTIONS[0],
      category: SHARE_CATEGORIES[0],
    }),
    record('BackupMeta', 'backup-meta', {
      lastBackupAt: '2038-01-02T09:00',
      lastRestoreTestAt: '2038-01-03T09:00',
      recoveryCodeSetAt: '2038-01-04T09:00',
    }),
    record('SyncState', 'sync-state', {
      relayUrl: null,
      spaceId: 'synthetic-space',
      cursors: { slots: 0, log: 0 },
      tombstoneHorizon: 0,
    }),
    {
      entity: 'Profile',
      logicalId: 'synthetic-deleted-profile' as LogicalId,
      authorDevice: DEVICE_ID,
      hlc: syntheticHlc,
      deleted: true,
    },
  ];
}

async function parseRecords(records: readonly LogicalRecord[]) {
  const document = createPortableDocument(records, SCHEMA_VERSION);
  return parsePortableFile(new Blob([JSON.stringify(document)]), SCHEMA_VERSION);
}

describe('portable record schema validation', () => {
  it('accepts supported entity records, all tracker value families, and exact tombstones', async () => {
    const records = supportedRecords();

    await expect(parseRecords(records)).resolves.toMatchObject({
      ok: true,
      document: { records },
    });
    const trackerKeys = Object.keys(fullDayBody()).filter((key) =>
      TRACKERS.includes(key as (typeof TRACKERS)[number]),
    );
    expect(trackerKeys).toHaveLength(TRACKERS.length);
  });

  it('rejects excluded projection/key entities and malformed entity-specific fields', async () => {
    const valid = supportedRecords();
    const day = valid.find((item) => item.entity === 'DayBundle');
    const profile = valid.find((item) => item.entity === 'Profile');
    if (!day || !profile || day.deleted || profile.deleted) {
      throw new Error('Synthetic portable records are incomplete.');
    }

    const invalidRecords: LogicalRecord[] = [
      record('ShareEpochKey', 'excluded-share-key', {}),
      record('Projection', 'excluded-projection', {}),
      {
        ...profile,
        body: { ...profile.body, extra: true },
      } as LogicalRecord,
      {
        ...day,
        body: { ...day.body, flow: 'unknown' },
      } as unknown as LogicalRecord,
      {
        ...day,
        body: {
          ...day.body,
          localDate: '2038-02-30',
        },
      } as LogicalRecord,
      {
        ...day,
        body: {
          ...day.body,
          bbt: { valueC: 36, measuredAt: '24:00', disturbances: [] },
        },
      } as unknown as LogicalRecord,
      {
        ...profile,
        hlc: { ...syntheticHlc, counter: -1 },
      } as LogicalRecord,
      {
        ...profile,
        deleted: true,
        body: { unexpected: 'synthetic extra tombstone body' },
      } as LogicalRecord,
    ];

    for (const invalid of invalidRecords) {
      await expect(parseRecords([invalid])).resolves.toEqual({
        ok: false,
        error: 'invalid_file',
      });
    }
  });

  it('rejects non-finite JSON numbers and future schemas without importing them', async () => {
    const finiteNumberFailure = JSON.stringify(createPortableDocument([
      record('Profile', 'profile-infinity', {
        goal: 'track',
        lifeStage: 'cycle',
        units: { temp: 'celsius', weight: 'kg' },
        weekStart: 1,
        theme: 'system',
        lockTimeoutSec: 1e309,
        quickHideEnabled: false,
      }),
    ], SCHEMA_VERSION)).replace('"lockTimeoutSec":null', '"lockTimeoutSec":1e309');
    await expect(
      parsePortableFile(new Blob([finiteNumberFailure]), SCHEMA_VERSION),
    ).resolves.toEqual({ ok: false, error: 'invalid_file' });

    const future = createPortableDocument([], SCHEMA_VERSION + 1);
    await expect(
      parsePortableFile(new Blob([JSON.stringify(future)]), SCHEMA_VERSION),
    ).resolves.toEqual({ ok: false, error: 'newer_schema' });
  });
});
