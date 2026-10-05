/**
 * `BackupService` (architecture.md §3 `backup`; storage-sync-decision.md §7;
 * security-privacy.md T-BAK-04). Export files are in-memory `Blob`s with
 * neutral names.
 */
import type { BackupMeta, EntityName } from './entities.ts';
import type { Tracker } from './enums.ts';

/**
 * Entities that never enter the partner device's backups or exports: her
 * projections and category keys (T-BAK-04). The couple key lives in the
 * keyring and is excluded as well. His backup holds only couple entries he
 * wrote.
 */
export const PARTNER_BACKUP_EXCLUDED_ENTITIES = [
  'Projection',
  'ShareEpochKey',
] as const satisfies readonly EntityName[];

export type BackupSecret =
  | { readonly kind: 'passphrase'; readonly passphrase: string }
  | { readonly kind: 'recovery_code'; readonly code: string };

export interface ExportFile {
  readonly file: Blob;
  readonly fileName: string;
}

export interface ImportSummary {
  readonly schemaVersion: number;
  readonly countsByEntity: Readonly<Partial<Record<EntityName, number>>>;
  readonly newer: number;
  readonly older: number;
  readonly conflicts: number;
}

export type ImportResult =
  | { readonly ok: true; readonly summary: ImportSummary; readonly applied: boolean }
  | { readonly ok: false; readonly error: 'invalid_file' | 'newer_schema' | 'wrong_secret' };

export interface RestoreTestReport {
  readonly ok: boolean;
  readonly countsByEntity: Readonly<Partial<Record<EntityName, number>>>;
  readonly checksumMatches: boolean;
}

export interface BackupService {
  /** Versioned JSON export of all records this device may export. */
  exportJson(): Promise<ExportFile>;
  /** Per-tracker CSV export. */
  exportCsv(tracker: Tracker): Promise<ExportFile>;
  /** Validates, then merges by HLC unless `dryRun`. */
  importJson(file: Blob, options: { readonly dryRun: boolean }): Promise<ImportResult>;
  /** Encrypted `.flobak` file. */
  createEncryptedBackup(): Promise<ExportFile>;
  restoreEncryptedBackup(file: Blob, secret: BackupSecret): Promise<ImportResult>;
  /** Decrypts into memory and checks counts and checksum; writes nothing. */
  testRestore(file: Blob, secret: BackupSecret): Promise<RestoreTestReport>;
  getMeta(): Promise<BackupMeta>;
}
