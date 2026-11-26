import { open, seal, sha256Hex, type SealedBox } from './crypto.ts';
import { isSnapshot, type Snapshot } from './snapshot.ts';

/** Relay base URL, fixed at build time. Empty when sharing isn't configured. */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL ?? '').replace(/\/+$/, '');

interface Keys {
  readonly coupleId: string;
  readonly readKey: string;
}

function url(coupleId: string, suffix = ''): string {
  return `${RELAY_URL}/v1/couples/${encodeURIComponent(coupleId)}${suffix}`;
}

async function send(input: string, init: RequestInit): Promise<Response> {
  if (RELAY_URL === '') throw new Error('Sharing is not set up in this build.');
  return fetch(input, { ...init, cache: 'no-store', credentials: 'omit' });
}

/** Register the couple; the relay keeps only the hash of the write key. */
export async function createCouple(keys: Keys & { readonly writeKey: string }): Promise<void> {
  const response = await send(url(keys.coupleId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ writeKeyHash: await sha256Hex(keys.writeKey) }),
  });
  if (response.status !== 201) throw new Error(`Relay refused pairing (${response.status}).`);
}

export async function uploadSnapshot(
  keys: Keys & { readonly writeKey: string },
  snapshot: Snapshot,
): Promise<void> {
  const box: SealedBox = await seal(keys, snapshot);
  const response = await send(url(keys.coupleId, '/snapshot'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.writeKey}` },
    body: JSON.stringify(box),
  });
  if (response.status !== 204) throw new Error(`Upload failed (${response.status}).`);
}

export type FetchResult =
  | { readonly status: 'ok'; readonly snapshot: Snapshot }
  | { readonly status: 'empty' }
  | { readonly status: 'missing' }
  | { readonly status: 'unreadable' };

/** Fetch and decrypt the latest snapshot. Network failures throw. */
export async function fetchSnapshot(keys: Keys): Promise<FetchResult> {
  const response = await send(url(keys.coupleId, '/snapshot'), { method: 'GET' });
  if (response.status === 404) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error === 'no_snapshot' ? { status: 'empty' } : { status: 'missing' };
  }
  if (!response.ok) throw new Error(`Fetch failed (${response.status}).`);
  const box = (await response.json()) as Partial<SealedBox>;
  if (typeof box.iv !== 'string' || typeof box.ct !== 'string') return { status: 'unreadable' };
  const value = await open(keys, { iv: box.iv, ct: box.ct });
  return isSnapshot(value) ? { status: 'ok', snapshot: value } : { status: 'unreadable' };
}

/** Delete the couple and its snapshot from the relay. A missing couple counts as deleted. */
export async function deleteCouple(keys: Keys & { readonly writeKey: string }): Promise<void> {
  const response = await send(url(keys.coupleId), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${keys.writeKey}` },
  });
  if (response.status !== 204 && response.status !== 404) {
    throw new Error(`Unpair failed (${response.status}).`);
  }
}
