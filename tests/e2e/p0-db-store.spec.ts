import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LogicalId } from '../../src/contracts/brand.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import type { FixtureApi } from './db-store-fixtures/fixture.ts';
interface SchemaV0Fixture {
  readonly synthetic: true;
  readonly canary: string;
  readonly nextDate: LocalDate;
  readonly record: LogicalRecord;
}

const schemaV0 = JSON.parse(
  readFileSync(new URL('../fixtures/schema/v0.json', import.meta.url), 'utf8'),
) as SchemaV0Fixture;

declare global {
  interface Window {
    floDbTest: FixtureApi;
  }
}

let vite: ViteDevServer | undefined;
let fixtureUrl = '';

async function openFixture(page: Page): Promise<void> {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => window.floDbTest !== undefined);
}

type DayBundleRecord = Extract<LogicalRecord, { readonly entity: 'DayBundle' }> & {
  readonly deleted: false;
};
const fixtureRecord = schemaV0.record as unknown as DayBundleRecord;
const canary = schemaV0.canary;

function migrationAttemptId(pending: unknown): string | undefined {
  if (typeof pending !== 'object' || pending === null || !('attemptId' in pending)) {
    return undefined;
  }
  return typeof pending.attemptId === 'string' ? pending.attemptId : undefined;
}

test.beforeAll(async () => {
  vite = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite fixture server did not start');
  fixtureUrl = `http://127.0.0.1:${address.port}/tests/e2e/db-store-fixtures/`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-SEC-01 @db keeps record canaries and LocalDate values out of the raw IndexedDB dump', async ({
  page,
}) => {
  await openFixture(page);
  const loggedCanaryRecord = {
    ...fixtureRecord,
    logicalId: `${canary}-2031-02-03` as LogicalId,
    body: { ...fixtureRecord.body, notes: canary },
  } as LogicalRecord;
  await page.evaluate(async (record) => {
    await window.floDbTest.open('app', 1);
    await window.floDbTest.put(record);
  }, loggedCanaryRecord);
  const dump = await page.evaluate(() => window.floDbTest.rawDump());

  expect(dump).not.toContain(canary);
  expect(dump).not.toContain(loggedCanaryRecord.logicalId);
  expect(dump).not.toContain('2031-02-03');
  expect(dump).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  expect(dump).toContain('"type":"day"');
});

test('T-MIG-01 @db migrates v0 once, keeps an encrypted snapshot, and aborts safely on failure', async ({
  page,
}) => {
  await openFixture(page);
  const success = await page.evaluate(async (record) => {
    await window.floDbTest.open('app-migration-success', 0);
    await window.floDbTest.put(record);
    window.floDbTest.close();
    const before = await window.floDbTest.rawDump('app-migration-success');
    const outcome = await window.floDbTest.runMigration('app-migration-success', 1);
    const afterFirst = await window.floDbTest.rawDump('app-migration-success');
    await window.floDbTest.open('app-migration-success', 1);
    const migrated = await window.floDbTest.get(record.logicalId);
    const exported = await window.floDbTest.list();
    const exportJson = JSON.stringify(exported);
    window.floDbTest.close();
    await window.floDbTest.open('app-migration-import', 1);
    for (const imported of JSON.parse(exportJson) as LogicalRecord[]) {
      await window.floDbTest.put(imported);
    }
    const imported = await window.floDbTest.list();
    window.floDbTest.close();
    const second = await window.floDbTest.runMigration('app-migration-success', 1);
    const afterSecond = await window.floDbTest.rawDump('app-migration-success');
    return { before, outcome, afterFirst, migrated, exported, imported, second, afterSecond };
  }, fixtureRecord);
  expect(success.outcome).toEqual({ status: 'migrated', from: 0, to: 1 });
  expect(success.migrated).toMatchObject({ body: { localDate: schemaV0.nextDate } });
  expect(success.imported).toEqual(success.exported);
  expect(success.afterFirst).toContain('"snapshots":[{');
  expect(success.afterFirst).not.toContain(canary);
  expect(success.afterFirst).not.toContain('2031-02-03');
  expect(success.second).toEqual({ status: 'up_to_date', schemaVersion: 1 });
  const firstRows = (JSON.parse(success.afterFirst) as { records: unknown[] }).records;
  const secondDump = JSON.parse(success.afterSecond) as {
    records: unknown[];
    snapshots: unknown[];
  };
  expect(secondDump.records).toEqual(firstRows);
  expect(secondDump.snapshots).toHaveLength(0);
  expect(success.afterSecond).not.toContain(canary);
  expect(success.afterSecond).not.toContain('2031-02-03');

  const secondFixtureRecord = {
    ...fixtureRecord,
    logicalId: 'synthetic-migration-second' as LogicalId,
    body: { ...fixtureRecord.body, localDate: '2031-02-06' as LocalDate },
  } as LogicalRecord;
  const failure = await page.evaluate(
    async ({ first, second }) => {
      await window.floDbTest.open('app-migration-failure', 0);
      await window.floDbTest.put(first);
      await window.floDbTest.put(second);
      window.floDbTest.close();
      const before = await window.floDbTest.rawDump('app-migration-failure');
      const outcome = await window.floDbTest.runMigration('app-migration-failure', 1, true);
      const after = await window.floDbTest.rawDump('app-migration-failure');
      return { before, outcome, after };
    },
    { first: fixtureRecord, second: secondFixtureRecord },
  );
  expect(failure.outcome).toEqual({ status: 'failed', from: 0, snapshotKept: true });
  const parseDump = (dump: string) =>
    JSON.parse(dump) as {
      records: unknown[];
      snapshots: unknown[];
      meta: Array<{ key: string; value: unknown }>;
    };
  const beforeDump = parseDump(failure.before);
  const afterDump = parseDump(failure.after);
  expect(afterDump.records).toEqual(beforeDump.records);
  expect(afterDump.meta.find((row) => row.key === 'schemaVersion')?.value).toBe(0);
  expect(afterDump.meta.find((row) => row.key === 'migrationPending')?.value).toBe(false);
  expect(afterDump.snapshots).toHaveLength(1);
  expect(failure.after).not.toContain(canary);
  expect(failure.after).not.toContain('2031-02-03');
});

test('migration runner @db recovers a stale migration barrier without throwing', async ({
  page,
}) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    await window.floDbTest.open('app-stale-migration', 0);
    await window.floDbTest.put(record);
    window.floDbTest.close();
    await window.floDbTest.setMigrationPending('app-stale-migration');
    const outcome = await window.floDbTest.runMigration('app-stale-migration', 1);
    const status = await window.floDbTest.open('app-stale-migration', 1);
    await window.floDbTest.put({
      ...record,
      logicalId: 'synthetic-after-stale-migration' as LogicalId,
    });
    window.floDbTest.close();
    const second = await window.floDbTest.runMigration('app-stale-migration', 1);
    return { outcome, status, second };
  }, fixtureRecord);

  expect(result.outcome).toEqual({ status: 'migrated', from: 0, to: 1 });
  expect(result.status).toBe('READY');
  expect(result.second).toEqual({ status: 'up_to_date', schemaVersion: 1 });
});

test('fresh databases @db use SCHEMA_VERSION as the IndexedDB version', async ({ page }) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const status = await window.floDbTest.open('app-fresh-schema-version', 2);
    const databaseVersion = window.floDbTest.currentDatabaseVersion();
    const dump = await window.floDbTest.rawDump('app-fresh-schema-version');
    window.floDbTest.close();
    return { status, databaseVersion, dump };
  });

  expect(result.status).toBe('READY');
  expect(result.databaseVersion).toBe(2);
  expect(result.dump).toContain('"value":2');
});

test('entity ids @db stay distinct for equal logical ids', async ({ page }) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    const override = { ...record, entity: 'PeriodOverride' } as unknown as LogicalRecord;
    await window.floDbTest.open('app-entity-identity', 1);
    await window.floDbTest.put(record);
    await window.floDbTest.put(override);
    const day = await window.floDbTest.getEntity('DayBundle', record.logicalId);
    const periodOverride = await window.floDbTest.getEntity('PeriodOverride', record.logicalId);
    const dump = await window.floDbTest.rawDump('app-entity-identity');
    window.floDbTest.close();
    return { day, periodOverride, dump };
  }, fixtureRecord);

  expect(result.day?.entity).toBe('DayBundle');
  expect(result.periodOverride?.entity).toBe('PeriodOverride');
  expect((JSON.parse(result.dump) as { records: unknown[] }).records).toHaveLength(2);
});

test('legacy in-place migration @db reloads open stores before stale-schema writes', async ({
  page,
}) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    await window.floDbTest.open('app-legacy-in-place', 0);
    await window.floDbTest.put(record);
    const outcome = await window.floDbTest.runMigration('app-legacy-in-place', 1);
    let writeError = '';
    try {
      await window.floDbTest.put({
        ...record,
        logicalId: 'synthetic-stale-schema-write' as LogicalId,
      });
    } catch (error) {
      writeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    return {
      outcome,
      writeError,
      reloadNeeded: window.floDbTest.reloadNeeded(),
      reloadVersion: window.floDbTest.reloadVersion(),
    };
  }, fixtureRecord);

  expect(result.outcome).toEqual({ status: 'migrated', from: 0, to: 1 });
  expect(result.writeError).toContain('InvalidStateError');
  expect(result.reloadNeeded).toBe(true);
  expect(result.reloadVersion).toBe(1);
});

test('transaction schema recheck @db rejects stale writes without a broadcast', async ({
  page,
}) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    await window.floDbTest.open('app-schema-recheck', 0);
    await window.floDbTest.put(record);
    await window.floDbTest.setSchemaVersionWithoutNotification('app-schema-recheck', 1);
    let writeError = '';
    try {
      await window.floDbTest.put({
        ...record,
        logicalId: 'synthetic-schema-recheck-write' as LogicalId,
      });
    } catch (error) {
      writeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    return {
      writeError,
      reloadNeeded: window.floDbTest.reloadNeeded(),
      reloadVersion: window.floDbTest.reloadVersion(),
    };
  }, fixtureRecord);

  expect(result.writeError).toContain('InvalidStateError');
  expect(result.reloadNeeded).toBe(true);
  expect(result.reloadVersion).toBe(1);
});

test('T2a @db serializes cross-window migrations with the Web Lock', async ({
  page,
  context,
}) => {
  await openFixture(page);
  const migratingWindow = page;
  const competingWindow = await context.newPage();
  await openFixture(competingWindow);
  const databaseName = 'app-cross-window-migration-lock';

  await migratingWindow.evaluate(
    async ({ databaseName, record }) => {
      await window.floDbTest.open(databaseName, 1);
      await window.floDbTest.put(record);
      window.floDbTest.close();
    },
    { databaseName, record: fixtureRecord },
  );
  await migratingWindow.evaluate(
    (name) => window.floDbTest.startPausedMigration(name, 2),
    databaseName,
  );
  await expect
    .poll(() => migratingWindow.evaluate(() => window.floDbTest.migrationPreparationReached()))
    .toBe(true);

  await migratingWindow.evaluate(
    (name) => window.floDbTest.holdRawConnection(name),
    databaseName,
  );
  const firstAttemptId = migrationAttemptId(
    await migratingWindow.evaluate(() => window.floDbTest.readMigrationPending()),
  );
  expect(firstAttemptId).toMatch(/^[0-9a-f]{32}$/);

  await competingWindow.evaluate((name) => window.floDbTest.startUpgrade(name, 2), databaseName);
  try {
    await competingWindow.waitForTimeout(150);
    const pending = await migratingWindow.evaluate(() =>
      window.floDbTest.readMigrationPending(),
    );
    expect(migrationAttemptId(pending)).toBe(firstAttemptId);
    expect(await competingWindow.evaluate(() => window.floDbTest.migrationSettled())).toBe(false);
  } finally {
    await migratingWindow.evaluate(() => window.floDbTest.releaseRawConnection());
    await migratingWindow.evaluate(() => window.floDbTest.resumeMigrationPreparation());
  }

  await expect
    .poll(() => migratingWindow.evaluate(() => window.floDbTest.migrationSettled()))
    .toBe(true);
  expect(await migratingWindow.evaluate(() => window.floDbTest.migrationResult())).toEqual({
    status: 'migrated',
    from: 1,
    to: 2,
  });
  await expect
    .poll(() => competingWindow.evaluate(() => window.floDbTest.migrationSettled()))
    .toBe(true);
  expect(await competingWindow.evaluate(() => window.floDbTest.migrationResult())).toEqual({
    status: 'up_to_date',
    schemaVersion: 2,
  });
});

test('T2b @db removes and renames records, is idempotent, and aborts safely', async ({
  page,
}) => {
  await openFixture(page);
  const databaseName = 'app-record-change-migration';
  const removeId = 'synthetic-migration-removed' as LogicalId;
  const renameFrom = 'synthetic-migration-before-rename' as LogicalId;
  const renameTo = 'synthetic-migration-after-rename' as LogicalId;
  const removedRecord = { ...fixtureRecord, logicalId: removeId } as LogicalRecord;
  const renamedRecord = {
    ...fixtureRecord,
    logicalId: renameFrom,
    body: { ...fixtureRecord.body, localDate: '2031-02-07' as LocalDate },
  } as DayBundleRecord;

  const result = await page.evaluate(
    async ({ databaseName, removeId, renameFrom, renameTo, removedRecord, renamedRecord }) => {
      await window.floDbTest.open(databaseName, 1);
      await window.floDbTest.put(removedRecord);
      await window.floDbTest.put(renamedRecord);
      window.floDbTest.close();
      const before = await window.floDbTest.rawDump(databaseName);
      const aborted = await window.floDbTest.runRecordChangeMigration(
        databaseName,
        removeId,
        renameFrom,
        renameTo,
        true,
      );
      const afterAbort = await window.floDbTest.rawDump(databaseName);
      const migrated = await window.floDbTest.runRecordChangeMigration(
        databaseName,
        removeId,
        renameFrom,
        renameTo,
      );
      const afterMigration = await window.floDbTest.rawDump(databaseName);
      const status = await window.floDbTest.open(databaseName, 2);
      const removed = await window.floDbTest.get(removeId);
      const oldKey = await window.floDbTest.get(renameFrom);
      const renamed = await window.floDbTest.get(renameTo);
      const listed = await window.floDbTest.list();
      window.floDbTest.close();
      const repeated = await window.floDbTest.runRecordChangeMigration(
        databaseName,
        removeId,
        renameFrom,
        renameTo,
      );
      const afterRepeated = await window.floDbTest.rawDump(databaseName);
      return {
        before,
        aborted,
        afterAbort,
        migrated,
        afterMigration,
        status,
        removed,
        oldKey,
        renamed,
        listed,
        repeated,
        afterRepeated,
      };
    },
    { databaseName, removeId, renameFrom, renameTo, removedRecord, renamedRecord },
  );

  type Dump = {
    records: unknown[];
    snapshots: unknown[];
    meta: Array<{ key: string; value: unknown }>;
  };
  const before = JSON.parse(result.before) as Dump;
  const afterAbort = JSON.parse(result.afterAbort) as Dump;
  const afterMigration = JSON.parse(result.afterMigration) as Dump;
  const afterRepeated = JSON.parse(result.afterRepeated) as Dump;

  expect(result.aborted).toEqual({ status: 'failed', from: 1, snapshotKept: true });
  expect(afterAbort.records).toEqual(before.records);
  expect(afterAbort.meta.find((row) => row.key === 'schemaVersion')?.value).toBe(1);
  expect(afterAbort.meta.find((row) => row.key === 'migrationPending')?.value).toBe(false);
  expect(afterAbort.snapshots).toHaveLength(1);

  expect(result.migrated).toEqual({ status: 'migrated', from: 1, to: 2 });
  expect(result.status).toBe('READY');
  expect(result.removed).toBeUndefined();
  expect(result.oldKey).toBeUndefined();
  expect(result.renamed).toMatchObject({ logicalId: renameTo, body: renamedRecord.body });
  expect(result.listed.map((record) => record.logicalId)).toEqual([renameTo]);
  expect(afterMigration.records).toHaveLength(1);
  expect(afterMigration.meta.find((row) => row.key === 'schemaVersion')?.value).toBe(2);

  expect(result.repeated).toEqual({ status: 'up_to_date', schemaVersion: 2 });
  expect(afterRepeated.records).toEqual(afterMigration.records);
  expect(afterRepeated.snapshots).toHaveLength(0);
});

test('migration barrier @db rejects a write from another open window', async ({
  page,
  context,
}) => {
  await openFixture(page);
  const migratingWindow = page;
  const writingWindow = await context.newPage();
  await openFixture(writingWindow);

  await migratingWindow.evaluate(async (record) => {
    await window.floDbTest.open('app-cross-window-barrier', 0);
    await window.floDbTest.put(record);
    window.floDbTest.close();
  }, fixtureRecord);
  await writingWindow.evaluate(() => window.floDbTest.open('app-cross-window-barrier', 0));
  await migratingWindow.evaluate(() =>
    window.floDbTest.startPausedMigration('app-cross-window-barrier', 1),
  );
  await expect
    .poll(() => migratingWindow.evaluate(() => window.floDbTest.migrationPreparationReached()))
    .toBe(true);

  const rejected = await writingWindow.evaluate(async (record) => {
    try {
      await window.floDbTest.put({
        ...record,
        logicalId: 'synthetic-cross-window-late-write' as LogicalId,
      });
      return '';
    } catch (error) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  }, fixtureRecord);
  expect(rejected).toContain('MigrationInProgressError');

  const outcome = await migratingWindow.evaluate(() =>
    window.floDbTest.releaseMigrationPreparation(),
  );
  expect(outcome).toEqual({ status: 'migrated', from: 0, to: 1 });
  await expect.poll(() => writingWindow.evaluate(() => window.floDbTest.reloadNeeded())).toBe(true);
  const dump = await migratingWindow.evaluate(() =>
    window.floDbTest.rawDump('app-cross-window-barrier'),
  );
  expect((JSON.parse(dump) as { records: unknown[] }).records).toHaveLength(1);
  await writingWindow.evaluate(() => window.floDbTest.close());
});

test('migration runner @db covers throwing migrate and versionchange failures', async ({
  page,
}) => {
  await openFixture(page);
  const secondRecord = {
    ...fixtureRecord,
    logicalId: 'synthetic-upgrade-second' as LogicalId,
  } as LogicalRecord;
  const result = await page.evaluate(
    async ({ first, second }) => {
      await window.floDbTest.open('app-upgrade-failure', 1);
      await window.floDbTest.put(first);
      await window.floDbTest.put(second);
      window.floDbTest.close();
      const before = await window.floDbTest.rawDump('app-upgrade-failure');
      const writeFailure = await window.floDbTest.runMigration('app-upgrade-failure', 2, true);
      const afterWriteFailure = await window.floDbTest.rawDump('app-upgrade-failure');
      const migrateFailure = await window.floDbTest.runMigration(
        'app-upgrade-failure',
        2,
        false,
        1,
      );
      const afterMigrateFailure = await window.floDbTest.rawDump('app-upgrade-failure');
      const success = await window.floDbTest.runMigration('app-upgrade-failure', 2);
      const status = await window.floDbTest.open('app-upgrade-failure', 2);
      const migrated = await window.floDbTest.get(first.logicalId);
      const version = window.floDbTest.currentDatabaseVersion();
      window.floDbTest.close();
      return {
        before,
        afterWriteFailure,
        afterMigrateFailure,
        writeFailure,
        migrateFailure,
        success,
        status,
        migrated,
        version,
      };
    },
    { first: fixtureRecord, second: secondRecord },
  );
  const before = JSON.parse(result.before) as {
    records: unknown[];
    meta: Array<{ key: string; value: unknown }>;
  };
  const afterWriteFailure = JSON.parse(result.afterWriteFailure) as {
    records: unknown[];
    snapshots: unknown[];
    meta: Array<{ key: string; value: unknown }>;
  };
  const afterMigrateFailure = JSON.parse(result.afterMigrateFailure) as {
    records: unknown[];
    snapshots: unknown[];
    meta: Array<{ key: string; value: unknown }>;
  };

  expect(result.writeFailure).toEqual({ status: 'failed', from: 1, snapshotKept: true });
  expect(result.migrateFailure).toEqual({ status: 'failed', from: 1, snapshotKept: true });
  expect(afterWriteFailure.records).toEqual(before.records);
  expect(afterMigrateFailure.records).toEqual(before.records);
  expect(afterWriteFailure.snapshots).toHaveLength(1);
  expect(afterMigrateFailure.snapshots).toHaveLength(1);
  expect(afterWriteFailure.meta.find((row) => row.key === 'schemaVersion')?.value).toBe(1);
  expect(afterMigrateFailure.meta.find((row) => row.key === 'schemaVersion')?.value).toBe(1);
  expect(afterWriteFailure.meta.find((row) => row.key === 'migrationPending')?.value).toBe(false);
  expect(afterMigrateFailure.meta.find((row) => row.key === 'migrationPending')?.value).toBe(false);
  expect(result.success).toEqual({ status: 'migrated', from: 1, to: 2 });
  expect(result.status).toBe('READY');
  expect(result.migrated).toMatchObject({ body: { localDate: schemaV0.nextDate } });
  expect(result.version).toBe(2);
});

test('T-SW-03 @db opens a newer schema read-only and reports NEWER_SCHEMA without mutation', async ({
  page,
}) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    await window.floDbTest.seedNewer('app-newer-schema');
    const before = await window.floDbTest.rawDump('app-newer-schema');
    const status = await window.floDbTest.open('app-newer-schema', 1);
    let writeError = '';
    try {
      await window.floDbTest.put(record);
    } catch (error) {
      writeError = error instanceof Error ? error.message : String(error);
    }
    window.floDbTest.close();
    const after = await window.floDbTest.rawDump('app-newer-schema');
    const migration = await window.floDbTest.runMigration('app-newer-schema', 1);
    return { status, writeError, before, after, migration };
  }, fixtureRecord);
  expect(result.status).toBe('NEWER_SCHEMA');
  expect(result.writeError).toContain('NEWER_SCHEMA');
  expect(result.after).toBe(result.before);
  expect(result.migration).toEqual({ status: 'read_only_newer_schema', stored: 2, code: 1 });
});

test('drain before reload @db signals only after the active write completes', async ({ page }) => {
  await openFixture(page);
  const result = await page.evaluate(async (record) => {
    await window.floDbTest.open('app-drain-reload', 1);
    await window.floDbTest.put(record);
    await window.floDbTest.startHeldWrite({
      ...record,
      logicalId: 'synthetic-drain-reload' as LogicalId,
    });
    window.floDbTest.simulateVersionChange(2);
    const signalledBeforeDrain = window.floDbTest.reloadNeeded();
    await window.floDbTest.releaseHeldWrite();
    return {
      signalledBeforeDrain,
      signalledAfterDrain: window.floDbTest.reloadNeeded(),
      reloadVersion: window.floDbTest.reloadVersion(),
    };
  }, fixtureRecord);

  expect(result.signalledBeforeDrain).toBe(false);
  expect(result.signalledAfterDrain).toBe(true);
  expect(result.reloadVersion).toBe(2);
});

test('update safety @db drains a leased write, closes the old window, and blocks upgrade until old connections close', async ({
  page,
  context,
}) => {
  await openFixture(page);
  const oldWindow = page;
  const upgradingWindow = await context.newPage();
  await openFixture(upgradingWindow);

  const recordToKeep = fixtureRecord;
  const recordDuringWrite = {
    ...fixtureRecord,
    logicalId: 'synthetic-p0-store-interleaved' as LogicalId,
    body: { ...fixtureRecord.body, localDate: '2031-02-05' as LocalDate },
  } as LogicalRecord;

  await oldWindow.evaluate(async (record) => {
    await window.floDbTest.open('app', 1);
    await window.floDbTest.put(record);
    await window.floDbTest.holdRawConnection();
    await window.floDbTest.startHeldWrite({
      ...record,
      logicalId: 'synthetic-p0-store-interleaved' as LogicalId,
      body: { ...record.body, localDate: '2031-02-05' as LocalDate },
    });
    window.floDbTest.startPrepare();
  }, recordToKeep);

  await expect.poll(() => oldWindow.evaluate(() => window.floDbTest.prepareSettled())).toBe(false);
  await upgradingWindow.evaluate(() => window.floDbTest.startUpgrade('app', 2));
  await oldWindow.waitForTimeout(150);
  expect(await oldWindow.evaluate(() => window.floDbTest.currentDatabaseVersion())).toBe(1);
  expect(await oldWindow.evaluate(() => window.floDbTest.prepareSettled())).toBe(false);
  expect(await oldWindow.evaluate(() => window.floDbTest.reloadNeeded())).toBe(false);
  expect(await upgradingWindow.evaluate(() => window.floDbTest.migrationSettled())).toBe(false);

  await oldWindow.evaluate(() => window.floDbTest.releaseHeldWrite());
  await expect.poll(() => oldWindow.evaluate(() => window.floDbTest.prepareReady())).toBe(true);
  await expect
    .poll(() => upgradingWindow.evaluate(() => window.floDbTest.blockedCount()))
    .toBeGreaterThan(0);
  await expect.poll(() => oldWindow.evaluate(() => window.floDbTest.reloadNeeded())).toBe(true);
  expect(await oldWindow.evaluate(() => window.floDbTest.reloadVersion())).toBe(2);
  expect(await upgradingWindow.evaluate(() => window.floDbTest.migrationSettled())).toBe(false);

  await oldWindow.evaluate(() => window.floDbTest.releaseRawConnection());
  await expect
    .poll(() => upgradingWindow.evaluate(() => window.floDbTest.migrationSettled()))
    .toBe(true);
  expect(await upgradingWindow.evaluate(() => window.floDbTest.migrationResult())).toEqual({
    status: 'migrated',
    from: 1,
    to: 2,
  });

  const records = await upgradingWindow.evaluate(async () => {
    await window.floDbTest.open('app', 2);
    return window.floDbTest.list();
  });
  expect(records.map((record) => record.logicalId)).toEqual(
    expect.arrayContaining([recordToKeep.logicalId, recordDuringWrite.logicalId]),
  );
  expect(records).toHaveLength(2);
  expect(await oldWindow.evaluate(() => window.floDbTest.reloadNeeded())).toBe(true);
  await upgradingWindow.evaluate(() => window.floDbTest.close());
});
