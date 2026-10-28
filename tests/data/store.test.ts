import { describe, expect, it } from 'vitest';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import type { DeviceId, LogicalId } from '../../src/contracts/brand.ts';
import { createCryptoApi } from '../../src/crypto/primitives/index.ts';
import {
  encodeRecordRow,
  decodeRecordRow,
  type RecordKeyProvider,
} from '../../src/data/store/codec.ts';
import { persistStorage } from '../../src/data/store/storage-persistence.ts';

const cryptoApi = createCryptoApi();
const canary = 'SYNTHETIC-CANARY-P0-DB-73';

async function keys(): Promise<{ readonly dataKey: CryptoKey; readonly indexKey: CryptoKey }> {
  const dataKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(17),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const indexKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(29),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return { dataKey, indexKey };
}

function makeRecord(): LogicalRecord {
  const deviceId = 'synthetic-device-p0' as DeviceId;
  return {
    entity: 'DayBundle',
    logicalId: 'synthetic-p0-store-day' as LogicalId,
    authorDevice: deviceId,
    hlc: { wallMs: 1740000000000, counter: 0, deviceId },
    deleted: false,
    body: {
      localDate: '2031-02-03' as LocalDate,
      flow: 'medium',
      notes: canary,
      fieldHlc: {},
    },
  } as LogicalRecord;
}

function keyProvider(dataKey: CryptoKey): RecordKeyProvider {
  return {
    snapshotKey: dataKey,
    forWrite: () => ({ key: dataKey, epoch: 0 }),
    forRead: () => [{ key: dataKey, epoch: 0 }],
  };
}

describe('encrypted record codec', () => {
  it('uses a 128-bit opaque HMAC id and keeps logical fields inside ciphertext', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const record = makeRecord();
    const row = await encodeRecordRow(record, 1, options);

    expect(row.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(row.id).not.toContain(record.logicalId);
    expect(JSON.stringify(row)).not.toContain(canary);
    expect(JSON.stringify(row)).not.toContain('2031-02-03');
    expect(await decodeRecordRow(row, 1, options)).toEqual(record);
  });

  it('domain-separates opaque ids by entity', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const day = makeRecord();
    const override = { ...day, entity: 'PeriodOverride' } as unknown as LogicalRecord;

    const dayRow = await encodeRecordRow(day, 1, options);
    const overrideRow = await encodeRecordRow(override, 1, options);

    expect(dayRow.id).not.toBe(overrideRow.id);
  });

  it('rejects ciphertext modified outside the sealed envelope', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const row = await encodeRecordRow(makeRecord(), 1, options);
    const tampered = {
      ...row,
      ct: `${row.ct.slice(0, -1)}${row.ct.endsWith('A') ? 'B' : 'A'}` as typeof row.ct,
    };

    await expect(decodeRecordRow(tampered, 1, options)).rejects.toThrow(
      'Record authentication failed',
    );
  });
});

describe('storage persistence helper', () => {
  it('reports unsupported storage without requesting persistence', async () => {
    await expect(persistStorage(undefined)).resolves.toEqual({
      supported: false,
      persisted: false,
      requested: false,
    });
  });

  it('requests persistence and reports the resulting browser status', async () => {
    let persisted = false;
    const storage = {
      async persisted() {
        return persisted;
      },
      async persist() {
        persisted = true;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: true,
      requested: true,
    });
  });

  it('requests persistence even when the initial status probe throws', async () => {
    let probes = 0;
    let requests = 0;
    const storage = {
      async persisted() {
        probes += 1;
        if (probes === 1) throw new Error('synthetic status probe failure');
        return false;
      },
      async persist() {
        requests += 1;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: false,
      requested: true,
    });
    expect(requests).toBe(1);
    expect(probes).toBe(2);
  });

  it('does not request storage again when it is already persistent', async () => {
    let requests = 0;
    const storage = {
      async persisted() {
        return true;
      },
      async persist() {
        requests += 1;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: true,
      requested: false,
    });
    expect(requests).toBe(0);
  });
});
