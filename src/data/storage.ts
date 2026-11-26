import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parse } from '../lib/date.ts';
import {
  COMFORT,
  CONTRACEPTION,
  DEFAULT_SETTINGS,
  DESIRE,
  DISCHARGE,
  FLOW,
  LEVEL,
  MOODS,
  PAIN,
  SATISFACTION,
  SLEEP_QUALITY,
  SYMPTOMS,
  THEMES,
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

/** Validate an export file and rebuild it from known fields only; returns an error message or the file. */
export function readExport(value: unknown): ExportFile | string {
  if (!isRecord(value)) return 'This is not a Flo export file.';
  if (value.app !== 'flo-lite' || value.version !== 1) return 'This is not a Flo export file.';
  if (!Array.isArray(value.days)) return 'The file has no days.';
  const days: DayLog[] = [];
  const seen = new Set<string>();
  for (const raw of value.days as unknown[]) {
    const day = readDay(raw);
    if (day === undefined) return 'The file has an invalid day.';
    if (seen.has(day.date)) return 'The file has the same day twice.';
    seen.add(day.date);
    days.push(day);
  }
  const settings = readSettings(value.settings);
  if (settings === undefined) return 'The file has invalid settings.';
  const exportedOn = parse(value.exportedOn as string);
  if (exportedOn === null) return 'This is not a Flo export file.';
  return { app: 'flo-lite', version: 1, exportedOn, settings, days };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function wholeNumber(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** Rebuild a day from known, valid fields; undefined if any present field is invalid. */
function readDay(raw: unknown): DayLog | undefined {
  if (!isRecord(raw)) return undefined;
  const date = parse(raw.date as string);
  if (date === null) return undefined;
  const out: Record<string, unknown> = { date };
  const ok = (key: string, valid: (value: unknown) => boolean): boolean => {
    if (raw[key] === undefined) return true;
    if (!valid(raw[key])) return false;
    out[key] = raw[key];
    return true;
  };
  const list =
    <T extends string>(allowed: readonly T[]) =>
    (value: unknown) =>
      Array.isArray(value) &&
      value.every((item) => oneOf(allowed, item)) &&
      new Set(value).size === value.length;
  const valid =
    ok('flow', (v) => oneOf(FLOW, v)) &&
    ok('soaking', (v) => typeof v === 'boolean') &&
    ok('pain', (v) => oneOf(PAIN, v)) &&
    ok('discharge', (v) => oneOf(DISCHARGE, v)) &&
    ok('symptoms', list(SYMPTOMS)) &&
    ok('energy', (v) => oneOf(LEVEL, v)) &&
    ok('mood', list(MOODS)) &&
    ok('desire', (v) => oneOf(DESIRE, v)) &&
    ok('sleepHours', (v) => typeof v === 'number' && v >= 0 && v <= 24) &&
    ok('sleepQuality', (v) => oneOf(SLEEP_QUALITY, v)) &&
    ok('activityMinutes', (v) => wholeNumber(v, 0, 1440)) &&
    ok('alcohol', (v) => wholeNumber(v, 0, 100)) &&
    ok('water', (v) => wholeNumber(v, 0, 100)) &&
    ok('notes', (v) => typeof v === 'string' && v.length <= 10_000);
  if (!valid) return undefined;
  if (raw.sex !== undefined) {
    if (!isRecord(raw.sex)) return undefined;
    const { comfort, satisfaction } = raw.sex;
    if (comfort !== undefined && !oneOf(COMFORT, comfort)) return undefined;
    if (satisfaction !== undefined && !oneOf(SATISFACTION, satisfaction)) return undefined;
    out.sex = {
      ...(comfort !== undefined ? { comfort } : {}),
      ...(satisfaction !== undefined ? { satisfaction } : {}),
    };
  }
  return out as unknown as DayLog;
}

function readSettings(raw: unknown): Settings | undefined {
  if (!isRecord(raw) || !oneOf(CONTRACEPTION, raw.contraception)) return undefined;
  const { cycleLength, periodLength, theme } = raw;
  if (cycleLength !== undefined && !wholeNumber(cycleLength, 15, 90)) return undefined;
  if (periodLength !== undefined && !wholeNumber(periodLength, 1, 14)) return undefined;
  if (theme !== undefined && !oneOf(THEMES, theme)) return undefined;
  return {
    // An export always comes from her phone.
    role: 'owner',
    contraception: raw.contraception,
    theme: theme ?? 'system',
    ...(cycleLength !== undefined ? { cycleLength } : {}),
    ...(periodLength !== undefined ? { periodLength } : {}),
  };
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
  await tx.objectStore('meta').put({ ...file.settings, role: 'owner' }, 'settings');
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
