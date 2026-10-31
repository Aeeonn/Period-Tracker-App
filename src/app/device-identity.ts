import type { Base64Url, DeviceId } from '../contracts/brand.ts';
import type { DeviceIdentity } from '../contracts/entities.ts';
import type { LogicalRecord } from '../contracts/store.ts';
import type { OpenRecordStore } from '../data/store/store.ts';
import { createHlcClock } from '../data/repos/hlc.ts';
import { logicalId } from '../data/repos/common.ts';
import {
  generateDeviceAgreementKeyPair,
  generateDeviceSigningKeyPair,
} from '../crypto/keyring/index.ts';
import { encodeBase64Url } from '../crypto/primitives/encoding.ts';
import type { LocalDateTime } from '../contracts/localdate.ts';

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface DevicePublicKeys {
  readonly signPub: Base64Url;
  readonly agreePub: Base64Url;
}

export interface EnsureDeviceIdentityOptions {
  readonly randomUUID?: () => string;
  readonly now?: () => Date;
  readonly generatePublicKeys?: () => Promise<DevicePublicKeys>;
}

function deviceIdFromUuid(value: string): DeviceId {
  if (!DEVICE_ID_PATTERN.test(value))
    throw new TypeError('The device ID must be a version 4 UUID.');
  return value as DeviceId;
}

function localDateTime(value: Date): LocalDateTime {
  const pad = (part: number) => String(part).padStart(2, '0');
  const year = String(value.getFullYear()).padStart(4, '0');
  const result = `${year}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(result)) {
    throw new RangeError('The local device creation time is invalid.');
  }
  return result as LocalDateTime;
}

async function generatePublicKeys(): Promise<DevicePublicKeys> {
  const [signing, agreement] = await Promise.all([
    generateDeviceSigningKeyPair(),
    generateDeviceAgreementKeyPair(),
  ]);
  const [signPub, agreePub] = await Promise.all([
    globalThis.crypto.subtle.exportKey('spki', signing.publicKey),
    globalThis.crypto.subtle.exportKey('spki', agreement.publicKey),
  ]);
  return {
    signPub: encodeBase64Url(new Uint8Array(signPub)),
    agreePub: encodeBase64Url(new Uint8Array(agreePub)),
  };
}

function existingDeviceId(records: readonly LogicalRecord<'DeviceIdentity'>[]): DeviceId | null {
  const active = records.filter((record) => !record.deleted);
  if (active.length === 0) return null;
  if (active.length !== 1) {
    throw new Error('More than one local device identity is stored.');
  }
  const record = active[0];
  if (!record || record.logicalId !== logicalId(record.body.deviceId)) {
    throw new Error('The saved device identity is invalid.');
  }
  return deviceIdFromUuid(record.body.deviceId);
}

/** Resolve or create the device ID inside the unlocked encrypted record store. */
export async function ensureDeviceIdentity(
  store: OpenRecordStore,
  options: EnsureDeviceIdentityOptions = {},
): Promise<DeviceId> {
  const findExisting = async () => existingDeviceId(await store.list('DeviceIdentity'));
  const existing = await findExisting();
  if (existing !== null) return existing;

  const now = options.now ?? (() => new Date());
  const createdAtDate = now();
  const deviceId = deviceIdFromUuid(
    (options.randomUUID ?? (() => globalThis.crypto.randomUUID()))(),
  );
  const publicKeys = await (options.generatePublicKeys ?? generatePublicKeys)();
  const identity: DeviceIdentity = {
    deviceId,
    role: 'owner',
    signPub: publicKeys.signPub,
    agreePub: publicKeys.agreePub,
    displayName: 'This device',
    createdAt: localDateTime(createdAtDate),
  };
  const clock = createHlcClock(deviceId, () => createdAtDate.getTime());
  const record: LogicalRecord<'DeviceIdentity'> = {
    entity: 'DeviceIdentity',
    logicalId: logicalId(deviceId),
    authorDevice: deviceId,
    hlc: clock.tick(),
    deleted: false,
    body: identity,
  };

  return store.transaction(async (tx) => {
    const concurrent = existingDeviceId(await tx.list('DeviceIdentity'));
    if (concurrent !== null) return concurrent;
    await tx.put(record);
    return deviceId;
  });
}
