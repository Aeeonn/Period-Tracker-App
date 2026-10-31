import { bench, describe } from 'vitest';
import type { DeviceId, LogicalId } from '../../src/contracts/brand.ts';
import type { DayBundle, DayField, Hlc } from '../../src/contracts/entities.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import type { LogicalRecord, RecordKeyProvider } from '../../src/contracts/store.ts';
import { createCryptoApi } from '../../src/crypto/primitives/index.ts';
import { createLogRepo } from '../../src/data/repos/index.ts';
import { SCHEMA_VERSION } from '../../src/data/store/schema.ts';
import type { RecordCodecOptions } from '../../src/data/store/codec.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';
import { EncryptedMemoryRecordStore } from './encrypted-memory-record-store.ts';

const dayCount = 730;
const sampleCount = 20;
const deviceId = 'synthetic-bench-device' as DeviceId;
const start = parse('2030-01-01');
if (!start) throw new Error('Invalid synthetic benchmark date');
const days: LocalDate[] = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
const end = days[days.length - 1];
if (!end) throw new Error('Synthetic benchmark date range is empty');

const samplesMs: number[] = [];

function dayClock(dayIndex: number, counter: number): Hlc {
  return { wallMs: 1_800_000_000_000 + dayIndex, counter, deviceId };
}

function makeDayRecord(dayIndex: number, localDate: LocalDate): LogicalRecord<'DayBundle'> {
  const fieldHlc: Partial<Record<DayField, Hlc>> = {
    flow: dayClock(dayIndex, 0),
    heavy_detail: dayClock(dayIndex, 1),
    period_pain: dayClock(dayIndex, 2),
    discharge: dayClock(dayIndex, 3),
    symptoms_body: dayClock(dayIndex, 4),
    mood: dayClock(dayIndex, 5),
    energy: dayClock(dayIndex, 6),
    stress: dayClock(dayIndex, 7),
    desire: dayClock(dayIndex, 8),
    sex: dayClock(dayIndex, 9),
    notes: dayClock(dayIndex, 10),
  };
  const body: DayBundle = {
    localDate,
    flow: dayIndex % 4 === 0 ? 'medium' : 'light',
    heavy_detail: dayIndex % 4 === 0 ? ['clots_over_2_5cm'] : [],
    period_pain: 'mild',
    discharge: 'creamy',
    symptoms_body: ['cramps', 'headache'],
    mood: ['calm'],
    energy: 2,
    stress: 1,
    desire: 'medium',
    sex: [
      {
        activity: ['vaginal'],
        protection: ['external_condom'],
        comfort: 'comfortable',
        satisfaction: 'ok',
        bleeding_after: 'no',
      },
    ],
    notes: `Synthetic benchmark record ${dayIndex}: ${'Fictional test-only note. '.repeat(32)}`,
    fieldHlc,
  };
  return {
    entity: 'DayBundle',
    logicalId: localDate as unknown as LogicalId,
    authorDevice: deviceId,
    hlc: dayClock(dayIndex, 11),
    deleted: false,
    body,
  };
}

async function createCodecOptions(): Promise<RecordCodecOptions> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Node globalThis.crypto.subtle is required for T-PERF-01');
  const dataKey = await subtle.importKey(
    'raw',
    new Uint8Array(32).fill(17),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const indexKey = await subtle.importKey(
    'raw',
    new Uint8Array(32).fill(29),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const material = { key: dataKey, epoch: 0 };
  const keyProvider: RecordKeyProvider = {
    snapshotKey: dataKey,
    forWrite: () => material,
    forRead: () => [material],
  };
  return { crypto: createCryptoApi(), indexKey, keyProvider };
}

async function buildFixture(): Promise<{
  readonly store: EncryptedMemoryRecordStore;
  readonly repo: ReturnType<typeof createLogRepo>;
}> {
  const codec = await createCodecOptions();
  const store = new EncryptedMemoryRecordStore(codec, SCHEMA_VERSION);
  for (let index = 0; index < days.length; index += 1) {
    const localDate = days[index];
    if (!localDate) throw new Error(`Missing synthetic date at ${index}`);
    await store.put(makeDayRecord(index, localDate));
  }
  if (store.rowCount !== dayCount) {
    throw new Error(`Expected ${dayCount} encrypted rows, found ${store.rowCount}`);
  }
  const firstRow = JSON.stringify(store.rawRows()[0] ?? {});
  if (firstRow.includes('Fictional test-only note') || firstRow.includes('2030-01-01')) {
    throw new Error('Encrypted benchmark rows must not contain plaintext health fields or dates');
  }
  return {
    store,
    repo: createLogRepo(store, { deviceId, nowMs: () => 1_800_000_001_000 }),
  };
}

// Setup happens before the timed runs. Keys are directly imported; this models
// the post-unlock path and deliberately excludes the passphrase KDF.
const { store, repo } = await buildFixture();

function reportSamples(): void {
  const ordered = [...samplesMs].sort((left, right) => left - right);
  const meanMs = samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length;
  const p95Ms = ordered[Math.ceil(0.95 * ordered.length) - 1];
  const maxMs = ordered[ordered.length - 1];
  console.log(
    `T-PERF-01 codec-backed load: rows=${store.rowCount}, samples=${samplesMs.length}, mean=${meanMs.toFixed(2)} ms, p95=${p95Ms?.toFixed(2)} ms, max=${maxMs?.toFixed(2)} ms (nearest-rank p95; KDF excluded)`,
  );
  if (maxMs !== undefined && maxMs > 1_500) {
    throw new Error(`T-PERF-01 exceeded 1.5 s: max load was ${maxMs.toFixed(2)} ms`);
  }
}

describe('T-PERF-01 encrypted log repository load after unlock', () => {
  bench(
    'decrypts and loads 730 realistic synthetic DayBundles below 1.5 s (no KDF)',
    async () => {
      const started = performance.now();
      const loaded = await repo.listDays({ start, end });
      const elapsedMs = performance.now() - started;
      if (loaded.length !== dayCount) throw new Error(`Loaded ${loaded.length} of ${dayCount} days`);
      samplesMs.push(elapsedMs);
      if (samplesMs.length === sampleCount) reportSamples();
    },
    { time: 0, iterations: sampleCount, warmupTime: 0, warmupIterations: 0 },
  );
});