import { describe, expect, it, vi } from 'vitest';
import type { Base64Url, DeviceId } from '../../src/contracts/brand.ts';
import type { LocalDateTime } from '../../src/contracts/localdate.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import type { OpenRecordStore } from '../../src/data/store/store.ts';
import { encodeBase64Url } from '../../src/crypto/primitives/encoding.ts';
import { ensureDeviceIdentity } from '../../src/app/device-identity.ts';
import { logicalId } from '../../src/data/repos/common.ts';
import { MemoryRecordStore } from '../data/repos/memory-record-store.ts';

const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000' as DeviceId;
const PUBLIC_KEY = encodeBase64Url(new Uint8Array([1, 2, 3])) as Base64Url;

class TestOpenRecordStore extends MemoryRecordStore implements OpenRecordStore {
  readonly status = 'READY' as const;
  readonly schemaVersion = 1;
  readonly databaseVersion = 1;
  readonly readOnly = false;

  close(): void {}
}

const options = {
  randomUUID: () => DEVICE_ID,
  now: () => new Date(2026, 0, 2, 3, 4),
  generatePublicKeys: async () => ({ signPub: PUBLIC_KEY, agreePub: PUBLIC_KEY }),
};

describe('ensureDeviceIdentity', () => {
  it('creates a UUID-backed identity once in the encrypted store and reuses it', async () => {
    const store = new TestOpenRecordStore();
    const randomUUID = vi.fn(options.randomUUID);

    const first = await ensureDeviceIdentity(store, { ...options, randomUUID });
    const second = await ensureDeviceIdentity(store, { ...options, randomUUID });

    expect(first).toBe(DEVICE_ID);
    expect(second).toBe(DEVICE_ID);
    expect(randomUUID).toHaveBeenCalledOnce();
    const saved = store.inspect('DeviceIdentity', logicalId(DEVICE_ID));
    expect(saved).toMatchObject({
      entity: 'DeviceIdentity',
      authorDevice: DEVICE_ID,
      deleted: false,
      body: { deviceId: DEVICE_ID, role: 'owner', createdAt: '2026-01-02T03:04' },
    });
  });

  it('rejects malformed IDs before writing an identity', async () => {
    const store = new TestOpenRecordStore();
    const malformedOptions = {
      ...options,
      randomUUID: () => 'not-a-uuid',
      generatePublicKeys: vi.fn(options.generatePublicKeys),
    };

    await expect(ensureDeviceIdentity(store, malformedOptions)).rejects.toThrow('version 4 UUID');
    expect(malformedOptions.generatePublicKeys).not.toHaveBeenCalled();
    expect(await store.list('DeviceIdentity')).toEqual([]);
  });

  it('rejects ambiguous existing local identities instead of choosing one', async () => {
    const store = new TestOpenRecordStore();
    const otherId = '223e4567-e89b-42d3-a456-426614174000' as DeviceId;
    const identity = (deviceId: DeviceId): LogicalRecord<'DeviceIdentity'> => ({
      entity: 'DeviceIdentity',
      logicalId: logicalId(deviceId),
      authorDevice: deviceId,
      hlc: { wallMs: 1, counter: 0, deviceId },
      deleted: false,
      body: {
        deviceId,
        role: 'owner',
        signPub: PUBLIC_KEY,
        agreePub: PUBLIC_KEY,
        displayName: 'Synthetic device',
        createdAt: '2026-01-02T03:04' as LocalDateTime,
      },
    });
    store.seed(identity(DEVICE_ID));
    store.seed(identity(otherId));

    await expect(ensureDeviceIdentity(store, options)).rejects.toThrow(
      'More than one local device identity',
    );
  });
});
