import type { ImportResult, ImportSummary } from '../../contracts/backup.ts';
import type { EntityName } from '../../contracts/entities.ts';
import type { LogicalRecord, LogRepo, SettingsRepo } from '../../contracts/store.ts';
import type { Tracker } from '../../contracts/enums.ts';
import type { PortableExportReader, PortableImportWriter } from '../../data/repos/index.ts';
import { SCHEMA_VERSION } from '../../data/store/schema.ts';
import { createTrackerCsv, createPortableDocument, parsePortableFile } from './codec.ts';

export interface PortableExportFile {
  readonly file: Blob;
  readonly fileName: string;
}

export interface PortableBackupService {
  exportJson(): Promise<PortableExportFile>;
  exportCsv(tracker: Tracker): Promise<PortableExportFile>;
  importJson(file: Blob, options: { readonly dryRun: boolean }): Promise<ImportResult>;
}

export interface PortableBackupRepositories {
  readonly logRepo: LogRepo;
  readonly settingsRepo: SettingsRepo;
}

const PARTNER_EXPORT_ENTITIES: ReadonlySet<EntityName> = new Set([
  'DeviceIdentity',
  'Profile',
  'ReminderRule',
  'BackupMeta',
  'CoupleEntry',
]);

function recordsForDevice(
  records: readonly LogicalRecord[],
  identity: Awaited<ReturnType<SettingsRepo['getDeviceIdentity']>>,
): readonly LogicalRecord[] {
  return records.filter((record) => {
    if (identity?.role === 'partner' && !PARTNER_EXPORT_ENTITIES.has(record.entity)) return false;
    // AP-08 allows either person to export the readable couple space before unpairing.
    return true;
  });
}

function importSummary(
  documentSchemaVersion: number,
  records: readonly LogicalRecord[],
  result: { readonly newer: number; readonly older: number; readonly conflicts: number },
): ImportSummary {
  const countsByEntity: Partial<Record<EntityName, number>> = {};
  for (const record of records) {
    countsByEntity[record.entity] = (countsByEntity[record.entity] ?? 0) + 1;
  }
  return {
    schemaVersion: documentSchemaVersion,
    countsByEntity,
    newer: result.newer,
    older: result.older,
    conflicts: result.conflicts,
  };
}

export function createPortableBackupService(
  repositories: PortableBackupRepositories,
): PortableBackupService {
  const exportReader = repositories.logRepo as LogRepo & PortableExportReader;
  const importWriter = repositories.settingsRepo as SettingsRepo & PortableImportWriter;

  async function exportRecords(): Promise<readonly LogicalRecord[]> {
    const [records, identity] = await Promise.all([
      exportReader.listPortableRecords(),
      repositories.settingsRepo.getDeviceIdentity(),
    ]);
    return recordsForDevice(records, identity);
  }

  return {
    async exportJson() {
      const records = await exportRecords();
      const document = createPortableDocument(records, SCHEMA_VERSION);
      return {
        file: new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
        fileName: 'data-export.json',
      };
    },

    async exportCsv(tracker: Tracker) {
      const records = await exportRecords();
      return {
        file: new Blob([createTrackerCsv(records, tracker)], { type: 'text/csv;charset=utf-8' }),
        fileName: `data-export-${tracker}.csv`,
      };
    },

    async importJson(file, options) {
      const parsed = await parsePortableFile(file, SCHEMA_VERSION);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const merge = await importWriter.mergePortableRecords(parsed.document.records, {
        dryRun: options.dryRun,
      });
      return {
        ok: true,
        summary: importSummary(parsed.document.schemaVersion, parsed.document.records, merge),
        applied: !options.dryRun,
      };
    },
  };
}