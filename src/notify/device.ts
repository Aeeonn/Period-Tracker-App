import {
  getAllDays,
  getNotify,
  getPushDevice,
  getSettings,
  getShare,
  savePushDevice,
  updateNotify,
} from '../data/storage.ts';
import type { NotifyPrefs, PushDevice, Settings } from '../data/types.ts';
import { runEngine, type EngineOutput } from '../engine/index.ts';
import { addDays, diffDays, todayLocal, type LocalDate } from '../lib/date.ts';
import { fromBase64Url, toBase64Url } from '../share/crypto.ts';
import { RELAY_URL } from '../share/relay-client.ts';
import { uploadPending } from '../share/sync.ts';
import { planReminders, type Planned } from './plan.ts';
import { firstReminderDay, sendTimes } from './schedule.ts';

/**
 * Reminder pushes: register this phone with the relay and keep its list of send
 * times current. Used by the app and by the service worker after each push.
 */

export type PushSupport = 'ok' | 'no_relay' | 'unsupported' | 'not_installed';

/** Whether this phone can get reminders right now, and if not, why. */
export function pushSupport(): PushSupport {
  if (RELAY_URL === '' || !import.meta.env.PROD) return 'no_relay';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported';
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return standalone ? 'ok' : 'not_installed';
}

async function relay(path: string, init: RequestInit = {}): Promise<Response> {
  if (RELAY_URL === '') throw new Error('Reminders are not set up in this build.');
  return fetch(`${RELAY_URL}${path}`, { ...init, cache: 'no-store', credentials: 'omit' });
}

const deviceAuth = (device: PushDevice) => ({ authorization: `Bearer ${device.secret}` });

function randomId(bytes: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function engineFor(
  settings: Settings,
  days: Parameters<typeof runEngine>[0]['days'],
  today: LocalDate,
): EngineOutput {
  return runEngine({
    today,
    days,
    contraception: settings.contraception,
    ...(settings.cycleLength ? { cycleLength: settings.cycleLength } : {}),
    ...(settings.periodLength ? { periodLength: settings.periodLength } : {}),
  });
}

/** Everything planned from `from` onwards for this phone, from its own data. */
export async function currentPlan(
  prefs: NotifyPrefs,
  today: LocalDate,
  from: LocalDate,
): Promise<{ plan: Planned[]; coupleId?: string }> {
  const settings = await getSettings();
  if (settings === undefined) return { plan: [] };
  if (settings.role === 'owner') {
    const days = await getAllDays();
    return {
      plan: planReminders({
        role: 'owner',
        from,
        today,
        prefs,
        settings,
        days,
        output: engineFor(settings, days, today),
      }),
    };
  }
  const share = await getShare();
  const linked = share?.role === 'partner' && share.ended !== true ? share : undefined;
  return {
    plan: planReminders({
      role: 'partner',
      from,
      today,
      prefs,
      snapshot: linked?.lastSnapshot,
    }),
    // Linking his phone to the couple lets her "period started" signal reach it.
    ...(linked && !prefs.off.includes('partner_period_started')
      ? { coupleId: linked.coupleId }
      : {}),
  };
}

/**
 * Send this phone's upcoming send times to the relay if they changed.
 * `registration` is the service worker registration (the worker passes its own).
 */
export async function syncReminders(
  registration: ServiceWorkerRegistration,
  options: { force?: boolean; nowMs?: number } = {},
): Promise<void> {
  const prefs = await getNotify();
  const device = await getPushDevice();
  if (!prefs.enabled || device === undefined) return;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(device.serverKey),
    }));
  const json = subscription.toJSON();
  const nowMs = options.nowMs ?? Date.now();
  const today = todayLocal({ nowMs });
  const from = firstReminderDay(today, addDays(today, 1), prefs.time, nowMs);
  const { plan, coupleId } = await currentPlan(prefs, today, from);
  const body = {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    times: sendTimes(plan, prefs.time, nowMs),
    ...(coupleId ? { coupleId } : {}),
  };
  const sentKey = JSON.stringify(body);
  if (!options.force && sentKey === device.sentKey) return;
  const response = await relay(`/v1/devices/${device.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...deviceAuth(device) },
    body: sentKey,
  });
  if (response.status !== 201 && response.status !== 204)
    throw new Error(`Could not update reminders (${response.status}).`);
  await savePushDevice({ ...device, endpoint: subscription.endpoint, sentKey });
}

export type EnableResult = 'on' | 'denied' | 'failed';

/**
 * Turn reminders on. Must be called straight from a tap: iOS only shows the
 * permission prompt in response to one, so nothing is awaited before asking.
 */
export async function enableReminders(today: LocalDate): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await relay('/v1/push/key');
    if (!keyResponse.ok) throw new Error(`No push key (${keyResponse.status}).`);
    const { key } = (await keyResponse.json()) as { key: string };
    const existing = await registration.pushManager.getSubscription();
    // A subscription made with another key can't be reused.
    if (
      existing !== null &&
      toBase64Url(new Uint8Array(existing.options.applicationServerKey ?? new ArrayBuffer(0))) !==
        key
    )
      await existing.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(key),
    });
    const device = await getPushDevice();
    await savePushDevice({
      id: device?.id ?? randomId(16),
      secret: device?.secret ?? randomId(24),
      endpoint: subscription.endpoint,
      serverKey: key,
    });
    const prefs = await getNotify();
    await updateNotify({ enabled: true, since: prefs.since ?? today });
    await syncReminders(registration, { force: true });
    return 'on';
  } catch {
    await updateNotify({ enabled: false });
    return 'failed';
  }
}

/** Forget this phone at the relay and stop its subscription. Never throws. */
export async function removePushDevice(): Promise<void> {
  const device = await getPushDevice().catch(() => undefined);
  if (device !== undefined) {
    try {
      await relay(`/v1/devices/${device.id}`, { method: 'DELETE', headers: deviceAuth(device) });
    } catch {
      // Unsubscribing below makes the push service refuse further pushes, and the relay then drops the device.
    }
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // Nothing more to stop.
  }
  await savePushDevice(undefined).catch(() => undefined);
}

export async function disableReminders(): Promise<void> {
  await updateNotify({ enabled: false });
  await removePushDevice();
}

/** Re-send the schedule after a change in the app. Quietly does nothing when reminders are off. */
export async function refreshReminders(): Promise<void> {
  if (pushSupport() !== 'ok') return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration !== undefined) await syncReminders(registration);
  } catch {
    // Retried on the next change or app open.
  }
}

export type TestResult = 'sent' | 'gone' | 'failed';

export async function sendTestReminder(): Promise<TestResult> {
  const device = await getPushDevice();
  if (device === undefined) return 'failed';
  try {
    const response = await relay(`/v1/devices/${device.id}/test`, {
      method: 'POST',
      headers: deviceAuth(device),
    });
    if (response.status === 410) {
      await disableReminders();
      return 'gone';
    }
    return response.status === 204 ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

let announcing: Promise<void> | undefined;

/**
 * If she chose to, tell his phone that her period started. Only for a period
 * starting today or yesterday, only once per period, and only while she shares
 * her period with him and sharing isn't paused.
 */
export function announcePeriodStart(output: EngineOutput, today: LocalDate): Promise<void> {
  announcing ??= (async () => {
    const prefs = await getNotify();
    const share = await getShare();
    const start = output.cycleStart;
    if (
      !prefs.tellPartner ||
      share?.role !== 'owner' ||
      share.paused ||
      !share.categories.includes('period') ||
      start === undefined ||
      start === prefs.lastAnnouncedStart
    )
      return;
    const age = diffDays(start, today);
    if (age < 0 || age > 1) return;
    // His phone refreshes her snapshot when the signal arrives, so send it first.
    await uploadPending();
    const response = await relay(`/v1/couples/${share.coupleId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${share.writeKey}` },
      body: JSON.stringify({ kind: 'signal' }),
    });
    if (response.ok) await updateNotify({ lastAnnouncedStart: start });
  })()
    .catch(() => {
      // Tried again on the next change or app open.
    })
    .finally(() => {
      announcing = undefined;
    });
  return announcing;
}
