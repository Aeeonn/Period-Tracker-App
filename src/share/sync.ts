import { getAllDays, getSettings, getShare, saveShare } from '../data/storage.ts';
import { DEFAULT_SETTINGS, type PartnerShare } from '../data/types.ts';
import { runEngine } from '../engine/index.ts';
import { todayLocal } from '../lib/date.ts';
import { fetchSnapshot, uploadSnapshot } from './relay-client.ts';
import { buildSnapshot } from './snapshot.ts';

const UPLOAD_DELAY_MS = 3000;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;
/** Bumped on every change, so an upload can tell whether it sent the latest data. */
let changes = 0;
const listeners = new Set<() => void>();

/** Be told when a background upload updates the stored share state. Returns an unsubscribe. */
export function onShareUpdated(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function uploadOnce(): Promise<void> {
  const share = await getShare();
  if (share?.role !== 'owner' || !share.pendingUpload) return;
  const seen = changes;
  const settings = (await getSettings()) ?? DEFAULT_SETTINGS;
  const days = await getAllDays();
  const output = runEngine({
    today: todayLocal(),
    days,
    contraception: settings.contraception,
    ...(settings.cycleLength ? { cycleLength: settings.cycleLength } : {}),
    ...(settings.periodLength ? { periodLength: settings.periodLength } : {}),
  });
  const now = Date.now();
  await uploadSnapshot(
    share,
    buildSnapshot({ output, days, categories: share.categories, paused: share.paused, now }),
  );
  const latest = await getShare();
  if (latest?.role !== 'owner' || latest.coupleId !== share.coupleId) return;
  const sentLatest =
    seen === changes &&
    latest.paused === share.paused &&
    latest.categories.join() === share.categories.join();
  await saveShare({ ...latest, pendingUpload: !sentLatest, lastUploadedAt: now });
  for (const listener of listeners) listener();
}

/** Upload her current snapshot if anything is pending. Errors leave it pending. */
export async function uploadPending(): Promise<void> {
  while (running !== undefined) {
    // Let the current upload finish, then send again so nothing newer is missed.
    await running;
  }
  running = uploadOnce()
    .catch(() => {
      // Stays pending; retried on the next change, app open or when back online.
    })
    .finally(() => {
      running = undefined;
    });
  return running;
}

/** Mark the snapshot out of date and upload after a short pause. */
export async function scheduleUpload(): Promise<void> {
  changes += 1;
  const share = await getShare();
  if (share?.role !== 'owner') return;
  if (!share.pendingUpload) await saveShare({ ...share, pendingUpload: true });
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void uploadPending();
  }, UPLOAD_DELAY_MS);
}

/** Fetch his copy of her snapshot. Network failures throw. */
export async function refreshPartner(): Promise<PartnerShare | undefined> {
  const share = await getShare();
  if (share?.role !== 'partner') return undefined;
  const result = await fetchSnapshot(share);
  let next: PartnerShare;
  if (result.status === 'ok') {
    if (
      share.lastSnapshot !== undefined &&
      result.snapshot.createdAt < share.lastSnapshot.createdAt
    ) {
      // Never go back to an older snapshot, e.g. one from before she paused.
      next = { ...share, lastFetchedAt: Date.now() };
    } else {
      const { ended: _ended, ...rest } = share;
      next = { ...rest, lastSnapshot: result.snapshot, lastFetchedAt: Date.now() };
    }
  } else if (result.status === 'missing') {
    // Her data is gone from the server, so his copy goes too.
    const { lastSnapshot: _dropped, ...rest } = share;
    next = { ...rest, ended: true };
  } else {
    next = { ...share, lastFetchedAt: Date.now() };
  }
  await saveShare(next);
  return next;
}
