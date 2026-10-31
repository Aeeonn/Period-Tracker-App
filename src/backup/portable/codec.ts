import { PARTNER_BACKUP_EXCLUDED_ENTITIES } from '../../contracts/backup.ts';
import type { EntityName, Hlc } from '../../contracts/entities.ts';
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
} from '../../contracts/enums.ts';
import type { LogicalRecord } from '../../contracts/store.ts';
import { ENTITY_NAMES, ENTITY_RECORD_TYPE } from '../../contracts/store.ts';
import { ENGINE_VERSION } from '../../contracts/engine-api.ts';
import { parse as parseLocalDate } from '../../lib/localdate/index.ts';

export const PORTABLE_FORMAT = 'flo-portable-data' as const;

export interface PortableDocument {
  readonly format: typeof PORTABLE_FORMAT;
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly records: readonly LogicalRecord[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOneOf<T extends readonly (string | number)[]>(value: unknown, values: T): value is T[number] {
  return values.some((candidate) => candidate === value);
}

function isLocalDate(value: unknown): boolean {
  return isString(value) && parseLocalDate(value) !== null;
}

function isLocalDateTime(value: unknown): boolean {
  return (
    isString(value) &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value) &&
    isLocalDate(value.slice(0, 10))
  );
}

function isLocalTime(value: unknown): boolean {
  return isString(value) && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOfOneOf<T extends readonly (string | number)[]>(value: unknown, values: T): boolean {
  return Array.isArray(value) && value.every((item) => isOneOf(item, values));
}

function isHlc(value: unknown): value is Hlc {
  return (
    isObject(value) &&
    hasExactKeys(value, ['wallMs', 'counter', 'deviceId']) &&
    isInteger(value.wallMs) &&
    value.wallMs >= 0 &&
    isInteger(value.counter) &&
    value.counter >= 0 &&
    isNonEmptyString(value.deviceId)
  );
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isObject(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isSexEvent(value: unknown): boolean {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ['activity', 'protection', 'comfort', 'satisfaction', 'bleeding_after']) ||
    !isArrayOfOneOf(value.activity, SEX_ACTIVITY) ||
    !isArrayOfOneOf(value.protection, SEX_PROTECTION)
  ) {
    return false;
  }
  return (
    (value.comfort === undefined || isOneOf(value.comfort, SEX_COMFORT)) &&
    (value.satisfaction === undefined || isOneOf(value.satisfaction, SEX_SATISFACTION)) &&
    (value.bleeding_after === undefined || isOneOf(value.bleeding_after, SEX_BLEEDING_AFTER))
  );
}

function isTestsLog(value: unknown): boolean {
  if (!isObject(value) || !hasOnlyKeys(value, ['pregnancy', 'lh', 'sti', 'emergency_contraception'])) {
    return false;
  }
  if (value.pregnancy !== undefined && !isOneOf(value.pregnancy, PREGNANCY_TEST_RESULT)) return false;
  if (value.lh !== undefined && !isOneOf(value.lh, LH_TEST_RESULT)) return false;
  if (
    value.sti !== undefined &&
    (!isObject(value.sti) ||
      !hasExactKeys(value.sti, ['taken', 'result']) ||
      value.sti.taken !== true ||
      !isOneOf(value.sti.result, STI_TEST_RESULT))
  ) {
    return false;
  }
  return (
    value.emergency_contraception === undefined ||
    isOneOf(value.emergency_contraception, EMERGENCY_CONTRACEPTION)
  );
}

function isDayShareSelection(value: unknown): boolean {
  if (!isObject(value) || !hasOnlyKeys(value, ['symptoms_body', 'mood'])) return false;
  return (
    (value.symptoms_body === undefined || isArrayOfOneOf(value.symptoms_body, SYMPTOMS_BODY)) &&
    (value.mood === undefined || isArrayOfOneOf(value.mood, MOOD))
  );
}

function isTrackerValue(tracker: (typeof TRACKERS)[number], value: unknown): boolean {
  switch (tracker) {
    case 'flow':
      return isOneOf(value, FLOW);
    case 'heavy_detail':
      return isArrayOfOneOf(value, HEAVY_DETAIL);
    case 'period_pain':
      return isOneOf(value, PERIOD_PAIN);
    case 'discharge':
      return isOneOf(value, DISCHARGE);
    case 'symptoms_body':
      return isArrayOfOneOf(value, SYMPTOMS_BODY);
    case 'mood':
      return isArrayOfOneOf(value, MOOD);
    case 'energy':
      return isOneOf(value, ZERO_TO_THREE);
    case 'stress':
      return isOneOf(value, STRESS);
    case 'desire':
      return isOneOf(value, DESIRE);
    case 'sex':
      return Array.isArray(value) && value.every(isSexEvent);
    case 'tests':
      return isTestsLog(value);
    case 'bbt':
      return (
        isObject(value) &&
        hasExactKeys(value, ['valueC', 'measuredAt', 'disturbances']) &&
        isFiniteNumber(value.valueC) &&
        isLocalTime(value.measuredAt) &&
        isArrayOfOneOf(value.disturbances, BBT_DISTURBANCE)
      );
    case 'ovulation_manual':
      return isOneOf(value, OVULATION_MANUAL);
    case 'pill_intake':
      return isOneOf(value, PILL_INTAKE);
    case 'medication':
      return (
        Array.isArray(value) &&
        value.every(
          (entry) =>
            isObject(entry) &&
            hasExactKeys(entry, ['name', 'taken']) &&
            isString(entry.name) &&
            isBoolean(entry.taken),
        )
      );
    case 'weight':
    case 'water':
    case 'alcohol':
      return isFiniteNumber(value);
    case 'sleep':
      return (
        isObject(value) &&
        hasExactKeys(value, ['hours', 'quality']) &&
        isFiniteNumber(value.hours) &&
        isOneOf(value.quality, ZERO_TO_THREE)
      );
    case 'activity':
      return (
        isObject(value) &&
        hasExactKeys(value, ['minutes', 'type']) &&
        isFiniteNumber(value.minutes) &&
        isOneOf(value.type, ACTIVITY_TYPE)
      );
    case 'notes':
      return isString(value);
    case 'peri_impact':
      return (
        isObject(value) &&
        hasExactKeys(value, PERI_IMPACT_ITEMS) &&
        Object.values(value).every((rating) => isOneOf(rating, ZERO_TO_THREE))
      );
    case 'lochia':
      return isOneOf(value, LOCHIA);
  }
}

function isDayBundle(value: Record<string, unknown>): boolean {
  if (
    !hasOnlyKeys(value, ['localDate', 'fieldHlc', 'shareSelection', ...TRACKERS]) ||
    !isLocalDate(value.localDate) ||
    !isObject(value.fieldHlc) ||
    !hasOnlyKeys(value.fieldHlc, [...TRACKERS, 'shareSelection']) ||
    !Object.entries(value.fieldHlc).every(([, stamp]) => isHlc(stamp)) ||
    (value.shareSelection !== undefined && !isDayShareSelection(value.shareSelection))
  ) {
    return false;
  }
  return TRACKERS.every(
    (tracker) => !Object.prototype.hasOwnProperty.call(value, tracker) || isTrackerValue(tracker, value[tracker]),
  );
}

function isCoupleEntryFields(kind: unknown, fields: unknown): boolean {
  if (!isObject(fields)) return false;
  const optionalTextKinds = kind === 'date' || kind === 'sex' || kind === 'checkin';
  return (
    hasOnlyKeys(fields, ['text']) &&
    (optionalTextKinds
      ? fields.text === undefined || isString(fields.text)
      : hasExactKeys(fields, ['text']) && isString(fields.text))
  );
}

function isEntityBody(entity: EntityName, value: unknown): boolean {
  if (!isObject(value) || !isJsonValue(value)) return false;
  switch (entity) {
    case 'DeviceIdentity':
      return (
        hasExactKeys(value, ['deviceId', 'role', 'signPub', 'agreePub', 'displayName', 'createdAt']) &&
        isNonEmptyString(value.deviceId) &&
        isOneOf(value.role, DEVICE_ROLES) &&
        isNonEmptyString(value.signPub) &&
        isNonEmptyString(value.agreePub) &&
        isString(value.displayName) &&
        isLocalDateTime(value.createdAt)
      );
    case 'Profile':
      return (
        hasOnlyKeys(value, ['birthYear', 'typicalCycleLength', 'typicalPeriodLength', 'goal', 'lifeStage', 'units', 'weekStart', 'theme', 'lockTimeoutSec', 'quickHideEnabled']) &&
        (value.birthYear === undefined || isInteger(value.birthYear)) &&
        (value.typicalCycleLength === undefined || isInteger(value.typicalCycleLength)) &&
        (value.typicalPeriodLength === undefined || isInteger(value.typicalPeriodLength)) &&
        isOneOf(value.goal, GOALS) &&
        isOneOf(value.lifeStage, LIFE_STAGES) &&
        isObject(value.units) &&
        hasExactKeys(value.units, ['temp', 'weight']) &&
        isOneOf(value.units.temp, TEMPERATURE_UNITS) &&
        isOneOf(value.units.weight, WEIGHT_UNITS) &&
        isOneOf(value.weekStart, ISO_WEEKDAYS) &&
        isOneOf(value.theme, THEMES) &&
        isInteger(value.lockTimeoutSec) &&
        isBoolean(value.quickHideEnabled)
      );
    case 'DayBundle':
      return isDayBundle(value);

    case 'PeriodOverride':
      return (
        hasExactKeys(value, ['localDate', 'kind']) &&
        isLocalDate(value.localDate) &&
        isOneOf(value.kind, PERIOD_OVERRIDE_KINDS)
      );
    case 'ContraceptionState':
      return (
        hasOnlyKeys(value, ['method', 'startDate', 'endDate', 'regimen']) &&
        isOneOf(value.method, CONTRACEPTION_METHODS) &&
        isLocalDate(value.startDate) &&
        (value.endDate === undefined || isLocalDate(value.endDate)) &&
        isObject(value.regimen) &&
        hasExactKeys(value.regimen, ['activeDays', 'breakDays', 'continuous']) &&
        isInteger(value.regimen.activeDays) &&
        isInteger(value.regimen.breakDays) &&
        isBoolean(value.regimen.continuous)
      );
    case 'PregnancyRecord':
      return (
        hasOnlyKeys(value, ['id', 'lmp', 'edd', 'eddSource', 'ivf', 'fetusCount', 'endedOn', 'outcome']) &&
        isNonEmptyString(value.id) &&
        (value.lmp === undefined || isLocalDate(value.lmp)) &&
        (value.edd === undefined || isLocalDate(value.edd)) &&
        isOneOf(value.eddSource, EDD_SOURCES) &&
        (value.ivf === undefined ||
          (isObject(value.ivf) &&
            hasExactKeys(value.ivf, ['transferDate', 'embryoAgeDays']) &&
            isLocalDate(value.ivf.transferDate) &&
            isInteger(value.ivf.embryoAgeDays))) &&
        isInteger(value.fetusCount) &&
        (value.endedOn === undefined || isLocalDate(value.endedOn)) &&
        (value.outcome === undefined || isOneOf(value.outcome, PREGNANCY_OUTCOMES))
      );
    case 'ReminderRule':
      return (
        hasExactKeys(value, ['id', 'kind', 'localTime', 'days', 'condition', 'enabled']) &&
        isNonEmptyString(value.id) &&
        isOneOf(value.kind, REMINDER_KINDS) &&
        isLocalTime(value.localTime) &&
        Array.isArray(value.days) &&
        value.days.every((day) => isOneOf(day, ISO_WEEKDAYS)) &&
        isOneOf(value.condition, REMINDER_CONDITIONS) &&
        isBoolean(value.enabled)
      );
    case 'ShareSetting':
      return (
        hasOnlyKeys(value, ['category', 'state', 'epoch', 'startDate', 'updatedHlc']) &&
        isOneOf(value.category, SHARE_CATEGORIES) &&
        isOneOf(value.state, SHARE_STATES) &&
        isInteger(value.epoch) &&
        (value.startDate === undefined || isLocalDate(value.startDate)) &&
        isHlc(value.updatedHlc)
      );
    case 'ShareEpochKey':
    case 'Projection':
      return false;
    case 'CoupleEntry':
      return (
        hasExactKeys(value, ['id', 'authorDeviceId', 'kind', 'localDate', 'fields', 'hlc']) &&
        isNonEmptyString(value.id) &&
        isNonEmptyString(value.authorDeviceId) &&
        isOneOf(value.kind, COUPLE_ENTRY_KINDS) &&
        isLocalDate(value.localDate) &&
        isCoupleEntryFields(value.kind, value.fields) &&
        isHlc(value.hlc)
      );
    case 'CoupleFlag':
      return (
        hasExactKeys(value, ['entryId', 'allowInHerInsights']) &&
        isNonEmptyString(value.entryId) &&
        isBoolean(value.allowInHerInsights)
      );
    case 'PredictionSnapshot':
      return (
        hasOnlyKeys(value, ['engineVersion', 'paramsHash', 'madeOn', 'center', 'lo', 'hi', 'actualStart']) &&
        isNonEmptyString(value.engineVersion) &&
        isNonEmptyString(value.paramsHash) &&
        isLocalDate(value.madeOn) &&
        isLocalDate(value.center) &&
        isLocalDate(value.lo) &&
        isLocalDate(value.hi) &&
        (value.actualStart === undefined || isLocalDate(value.actualStart))
      );
    case 'ConsentEvent':
      return (
        hasOnlyKeys(value, ['at', 'action', 'category']) &&
        isLocalDateTime(value.at) &&
        isOneOf(value.action, CONSENT_ACTIONS) &&
        (value.category === undefined || isOneOf(value.category, SHARE_CATEGORIES))
      );
    case 'BackupMeta':
      return (
        hasOnlyKeys(value, ['lastBackupAt', 'lastRestoreTestAt', 'recoveryCodeSetAt']) &&
        (value.lastBackupAt === undefined || isLocalDateTime(value.lastBackupAt)) &&
        (value.lastRestoreTestAt === undefined || isLocalDateTime(value.lastRestoreTestAt)) &&
        (value.recoveryCodeSetAt === undefined || isLocalDateTime(value.recoveryCodeSetAt))
      );
    case 'SyncState':
      return (
        hasExactKeys(value, ['relayUrl', 'spaceId', 'cursors', 'tombstoneHorizon']) &&
        (value.relayUrl === null || isString(value.relayUrl)) &&
        isNonEmptyString(value.spaceId) &&
        isObject(value.cursors) &&
        hasExactKeys(value.cursors, ['slots', 'log']) &&
        isInteger(value.cursors.slots) &&
        value.cursors.slots >= 0 &&
        isInteger(value.cursors.log) &&
        value.cursors.log >= 0 &&
        isInteger(value.tombstoneHorizon)
      );
  }
}

function isExcludedEntity(entity: EntityName): boolean {
  return (
    ENTITY_RECORD_TYPE[entity] === 'proj' ||
    PARTNER_BACKUP_EXCLUDED_ENTITIES.some((excluded) => excluded === entity)
  );
}

function isLogicalRecord(value: unknown): value is LogicalRecord {
  if (!isObject(value) || !isOneOf(value.entity, ENTITY_NAMES)) return false;
  const entity = value.entity;
  if (isExcludedEntity(entity)) return false;
  if (
    !isNonEmptyString(value.logicalId) ||
    !isNonEmptyString(value.authorDevice) ||
    !isHlc(value.hlc)
  ) {
    return false;
  }
  if (value.deleted === true) {
    return (
      hasExactKeys(value, ['entity', 'logicalId', 'authorDevice', 'hlc', 'deleted'])
    );
  }
  return (
    value.deleted === false &&
    hasExactKeys(value, ['entity', 'logicalId', 'authorDevice', 'hlc', 'deleted', 'body']) &&
    isEntityBody(entity, value.body)
  );
}


function isPortableDocument(value: unknown): value is PortableDocument {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['format', 'schemaVersion', 'engineVersion', 'records']) ||
    value.format !== PORTABLE_FORMAT ||
    !isInteger(value.schemaVersion) ||
    !isNonEmptyString(value.engineVersion) ||
    !Array.isArray(value.records)
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const record of value.records) {
    if (!isLogicalRecord(record)) return false;
    const key = `${record.entity}\u0000${record.logicalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function createPortableDocument(records: readonly LogicalRecord[], schemaVersion: number): PortableDocument {
  return {
    format: PORTABLE_FORMAT,
    schemaVersion,
    engineVersion: ENGINE_VERSION,
    records,
  };
}

export type ParsedPortableFile =
  | { readonly ok: true; readonly document: PortableDocument }
  | { readonly ok: false; readonly error: 'invalid_file' | 'newer_schema' };

export async function parsePortableFile(file: Blob, schemaVersion: number): Promise<ParsedPortableFile> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text()) as unknown;
  } catch {
    return { ok: false, error: 'invalid_file' };
  }
  if (
    isObject(value) &&
    isInteger(value.schemaVersion) &&
    value.schemaVersion > schemaVersion
  ) {
    return { ok: false, error: 'newer_schema' };
  }
  if (!isPortableDocument(value) || value.schemaVersion !== schemaVersion) {
    return { ok: false, error: 'invalid_file' };
  }
  return { ok: true, document: value };
}

function canonicalCell(value: string): string {
  const safe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function trackerValueText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

export function createTrackerCsv(
  records: readonly LogicalRecord[],
  tracker: (typeof TRACKERS)[number],
): string {
  const lines = [
    ['localDate', 'tracker', 'value'].map(canonicalCell).join(','),
  ];
  for (const record of records) {
    if (record.entity !== 'DayBundle' || record.deleted) continue;
    const day = record.body;
    if (!Object.prototype.hasOwnProperty.call(day, tracker)) continue;
    const value = (day as unknown as Record<string, unknown>)[tracker];
    lines.push(
      [day.localDate, tracker, trackerValueText(value)].map(canonicalCell).join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}