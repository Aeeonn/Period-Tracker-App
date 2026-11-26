import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parse } from '../lib/date.ts';
import {
  CONTRACEPTION,
  DEFAULT_SETTINGS,
  type DayLog,
  type ExportFile,
  type Settings,
  type ShareState,
} from './types.ts';
import type { LocalDate } from '../lib/date.ts';

/**
 * All data access goes through this module, so a lock or at-rest encryption can
 * be added later in one place.
 */
interface FloDb extends DBSchema {
  days: { key: string; value: DayLog };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'flo-lite';
let dbPromise: Promise<IDBPDatabase<FloDb>> | undefined;

function db(): Promise<IDBPDatabase<FloDb>> {
  dbPromise ??= openDB<FloDb>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('days', { keyPath: 'date' });
      database.createObjectStore('meta');
    },
  });
  return dbPromise;
}

/** True when a log has no recorded values besides its date. */
export function isEmptyLog(day: DayLog): boolean {
  return Object.entries(day).every(([key, value]) => {
    if (key === 'date' || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  });
}

/** Drop undefined fields, empty lists and blank notes. */
export function cleanLog(day: DayLog): DayLog {
  const entries = Object.entries(day).filter(([, value]) => {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  });
  return Object.fromEntries(entries) as unknown as DayLog;
}

export async function getAllDays(): Promise<DayLog[]> {
  return (await db()).getAll('days');
}

export async function getDay(date: LocalDate): Promise<DayLog | undefined> {
  return (await db()).get('days', date);
}

/** Save a day; an empty log deletes the day. */
export async function putDay(day: DayLog): Promise<void> {
  const database = await db();
  const cleaned = cleanLog(day);
  if (isEmptyLog(cleaned)) await database.delete('days', day.date);
  else await database.put('days', cleaned);
}

export async function getSettings(): Promise<Settings | undefined> {
  return (await (await db()).get('meta', 'settings')) as Settings | undefined;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('meta', settings, 'settings');
}

export async function getShare(): Promise<ShareState | undefined> {
  return (await (await db()).get('meta', 'share')) as ShareState | undefined;
}

export async function saveShare(share: ShareState | undefined): Promise<void> {
  const database = await db();
  if (share === undefined) await database.delete('meta', 'share');
  else await database.put('meta', share, 'share');
}

export async function exportData(today: LocalDate): Promise<ExportFile> {
  return {
    app: 'flo-lite',
    version: 1,
    exportedOn: today,
    settings: (await getSettings()) ?? DEFAULT_SETTINGS,
    days: (await getAllDays()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Validate the shape of an export file; returns an error message or the parsed file. */
export function readExport(value: unknown): ExportFile | string {
  if (typeof value !== 'object' || value === null) return 'This is not a Flo export file.';
  const file = value as Partial<ExportFile>;
  if (file.app !== 'flo-lite' || file.version !== 1) return 'This is not a Flo export file.';
  if (!Array.isArray(file.days)) return 'The file has no days.';
  for (const day of file.days as unknown[]) {
    if (typeof day !== 'object' || day === null) return 'The file has an invalid day.';
    if (parse((day as { date?: unknown }).date as string) === null) {
      return 'The file has an invalid date.';
    }
  }
  const settings = file.settings;
  if (
    typeof settings !== 'object' ||
    settings === null ||
    !CONTRACEPTION.includes(settings.contraception)
  ) {
    return 'The file has invalid settings.';
  }
  return file as ExportFile;
}

/** Replace every day and the settings with the file's contents. Sharing state is kept. */
export async function importData(file: ExportFile): Promise<void> {
  const database = await db();
  const tx = database.transaction(['days', 'meta'], 'readwrite');
  await tx.objectStore('days').clear();
  for (const day of file.days) {
    const cleaned = cleanLog(day);
    if (!isEmptyLog(cleaned)) await tx.objectStore('days').put(cleaned);
  }
  await tx.objectStore('meta').put({ ...DEFAULT_SETTINGS, ...file.settings }, 'settings');
  await tx.done;
}

/** Remove everything stored on this device. */
export async function deleteEverything(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['days', 'meta'], 'readwrite');
  await tx.objectStore('days').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}

/** For tests: close and forget the open connection. */
export async function closeForTests(): Promise<void> {
  if (dbPromise !== undefined) (await dbPromise).close();
  dbPromise = undefined;
}
