/**
 * Sync contracts (architecture.md §4.5; storage-sync-decision.md §3, §5).
 * Relay and file transports carry the same sealed envelopes. Plaintext
 * envelope metadata is limited to opaque ids, the coarse record type, the
 * author device, HLC, tombstone flag, schema version, epoch and key id;
 * categories, logical ids and dates are only inside the ciphertext.
 */
import type { Base64Url, DeviceId, KeyId, OpaqueId, SlotId } from './brand.ts';
import type { ControlMessageKind, RecordType, ShareCategory, SyncTransportKind } from './enums.ts';
import type { Hlc, SyncCursors } from './entities.ts';
import type { LogicalRecord } from './store.ts';

/** An AES-GCM sealed record (security-privacy.md §3 AAD binding). */
export interface SealedEnvelope {
  readonly v: 1;
  readonly id: OpaqueId;
  readonly type: RecordType;
  readonly authorDevice: DeviceId;
  readonly hlc: Hlc;
  readonly deleted: boolean;
  readonly schemaVersion: number;
  readonly epoch: number;
  readonly keyId: KeyId;
  readonly iv: Base64Url;
  readonly ct: Base64Url;
}

/** Replace-in-place projection snapshot; one opaque slot per category. */
export interface SlotWrite {
  readonly slot: SlotId;
  /** Only ever increases. */
  readonly version: number;
  readonly envelope: SealedEnvelope;
}

export interface OutboundBatch {
  readonly slotWrites: readonly SlotWrite[];
  readonly slotDeletes: readonly SlotId[];
  /** Couple entries and control messages for the append log. */
  readonly logAppends: readonly SealedEnvelope[];
}

export interface InboundBatch {
  readonly slots: readonly SlotWrite[];
  readonly log: readonly SealedEnvelope[];
  readonly cursors: SyncCursors;
}

export type SendResult =
  | { readonly status: 'sent'; readonly cursors: SyncCursors }
  /** Kept in the durable outbox and retried. */
  | { readonly status: 'queued'; readonly reason: 'offline' | 'quota' | 'unavailable' }
  /** Manual exchange: a neutral `.flosync` file for the share sheet. */
  | { readonly status: 'file_ready'; readonly file: Blob; readonly fileName: string };

export type ReceiveRequest =
  | { readonly kind: 'relay'; readonly cursors: SyncCursors }
  | { readonly kind: 'file'; readonly file: Blob };

export type ReceiveResult =
  | { readonly status: 'received'; readonly batch: InboundBatch }
  | { readonly status: 'unavailable'; readonly reason: 'offline' | 'quota' | 'unavailable' }
  | { readonly status: 'rejected'; readonly reason: 'malformed' | 'wrong_space' };

/** Swappable transport (storage-sync-decision.md §3). */
export interface SyncTransport {
  readonly kind: SyncTransportKind;
  send(batch: OutboundBatch): Promise<SendResult>;
  receive(request: ReceiveRequest): Promise<ReceiveResult>;
}

/**
 * Signed control message, sealed inside an envelope (threat T11): owner
 * signature, nonce, timestamp and a version that only increases.
 */
export interface ControlMessage {
  readonly kind: ControlMessageKind;
  readonly issuerDevice: DeviceId;
  readonly nonce: Base64Url;
  /** Wall-clock ms; ordering metadata, never a health date. */
  readonly issuedAtMs: number;
  readonly version: number;
  /** For `revoke` of one category; absent for "everything". */
  readonly category?: ShareCategory;
  readonly signature: Base64Url;
}

/** Losing side of a concurrent edit, kept 30 days and visible (constitution rule 6). */
export interface ConflictCopy {
  readonly record: LogicalRecord;
  readonly keptUntilMs: number;
}

export interface SyncReport {
  readonly sent: number;
  readonly received: number;
  readonly conflicts: number;
  readonly fullResync: boolean;
  readonly queued: boolean;
}

export interface SyncEngine {
  /** Adds sealed envelopes to the durable outbox. */
  enqueue(envelopes: readonly SealedEnvelope[]): Promise<void>;
  /** Sends the outbox and merges inbound records by HLC (last writer wins). */
  syncNow(transport: SyncTransport): Promise<SyncReport>;
  /** Imports a received `.flosync` file through the file transport. */
  importFile(file: Blob): Promise<SyncReport>;
  listConflicts(): Promise<readonly ConflictCopy[]>;
}
