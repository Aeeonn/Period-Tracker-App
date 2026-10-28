import { describe, expect, it } from 'vitest';
import type { LogicalRecord, Migration } from '../../src/contracts/store.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { applyMigrationSteps, decideSchemaVersion } from '../../src/data/migrations/index.ts';

type DayBundleRecord = Extract<LogicalRecord, { readonly entity: 'DayBundle' }> & {
  readonly deleted: false;
};

const initial = {
  entity: 'DayBundle',
  logicalId: 'synthetic-migration-day',
  authorDevice: 'synthetic-device-p0',
  hlc: { wallMs: 1740000000000, counter: 0, deviceId: 'synthetic-device-p0' },
  deleted: false,
  body: { localDate: '2031-02-03' as LocalDate, fieldHlc: {} },
} as unknown as DayBundleRecord;

const migration: Migration = {
  from: 0,
  to: 1,
  migrate(records) {
    return records.map((record) => {
      if (record.entity !== 'DayBundle' || record.deleted) return record;
      return {
        ...record,
        body: { ...record.body, localDate: '2031-02-04' as LocalDate },
      } as unknown as DayBundleRecord;
    });
  },
};

describe('schema migrations', () => {
  it('applies contiguous pure migration steps and preserves identity when repeated', () => {
    const once = applyMigrationSteps([initial], 0, 1, [migration]);
    expect(once[0]).toMatchObject({ body: { localDate: '2031-02-04' } });
    expect(applyMigrationSteps(once, 1, 1, [migration])).toEqual(once);
  });

  it('rejects a missing or discontinuous migration', () => {
    expect(() => applyMigrationSteps([initial], 0, 1, [])).toThrow('Missing contiguous migration');
    expect(() => applyMigrationSteps([initial], 0, 2, [migration])).toThrow(
      'Missing contiguous migration',
    );
  });

  it('propagates an injected migration failure without returning transformed records', () => {
    const failing: Migration = {
      from: 0,
      to: 1,
      migrate() {
        throw new Error('synthetic injected migration failure');
      },
    };
    expect(() => applyMigrationSteps([initial], 0, 1, [failing])).toThrow(
      'synthetic injected migration failure',
    );
    expect(initial.body).toMatchObject({ localDate: '2031-02-03' });
  });

  it('chooses migration or read-only newer-schema mode without downgrading', () => {
    expect(decideSchemaVersion(1, 0, 1)).toBe('migrate');
    expect(decideSchemaVersion(1, 1, 1)).toBe('up_to_date');
    expect(decideSchemaVersion(2, 2, 1)).toBe('newer');
    expect(decideSchemaVersion(2, 1, 1)).toBe('newer');
  });
});
