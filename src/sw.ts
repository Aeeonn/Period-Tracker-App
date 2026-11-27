/**
 * Offline support (network first for pages, cache first for built assets) and
 * reminders. A push carries only a signal such as {"k":"tick"}; the text is
 * written here from this phone's own data, so the relay never sees it.
 */
import { getNotify, getSettings, getShare, updateNotify } from './data/storage.ts';
import { diffDays, todayLocal } from './lib/date.ts';
import { currentPlan, syncReminders } from './notify/device.ts';
import { DISCREET, type Planned } from './notify/plan.ts';
import { refreshPartner } from './share/sync.ts';

// The project type-checks against the DOM library, so the few worker types used here are declared locally.
interface Waitable extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEventLike extends Waitable {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface PushEventLike extends Waitable {
  readonly data: { json(): unknown } | null;
}
interface ClickEventLike extends Waitable {
  readonly notification: Notification;
}
interface WindowClientLike {
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}
interface WorkerScope {
  readonly registration: ServiceWorkerRegistration;
  readonly location: Location;
  readonly clients: {
    claim(): Promise<void>;
    matchAll(options: {
      type: 'window';
      includeUncontrolled: boolean;
    }): Promise<readonly WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: Waitable) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'push', listener: (event: PushEventLike) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: ClickEventLike) => void): void;
}

const sw = self as unknown as WorkerScope;

const CACHE = 'flo-lite-v1';

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')));
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Requests to other origins (the sharing relay) are never cached.
  if (request.method !== 'GET' || url.origin !== sw.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

interface Note {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
}

const FALLBACK: Note = { title: 'Flo', body: 'Tap to open Flo.', url: '#/', tag: 'flo' };

/** What to show for a push. Daily log reminders only show when nothing else is due today. */
async function notesFor(kind: string): Promise<Note[]> {
  const prefs = await getNotify();
  const today = todayLocal();
  if (kind === 'test') {
    return [
      {
        title: prefs.discreet ? DISCREET.title : 'Reminders are on',
        body: prefs.discreet ? DISCREET.body : 'This is how Flo reminders will look.',
        url: '#/settings',
        tag: 'flo-test',
      },
    ];
  }
  if (!prefs.enabled) return [];
  if (kind === 's') {
    if ((await getSettings())?.role !== 'partner' || prefs.off.includes('partner_period_started'))
      return [];
    await refreshPartner().catch(() => undefined);
    // Say it only if what she shares right now shows a period that started today or yesterday.
    const share = await getShare();
    const snapshot = share?.role === 'partner' && !share.ended ? share.lastSnapshot : undefined;
    const start = snapshot?.period?.cycleStart;
    if (
      snapshot === undefined ||
      snapshot.paused ||
      !snapshot.categories.includes('period') ||
      start === undefined ||
      diffDays(start, today) < 0 ||
      diffDays(start, today) > 1
    )
      return [];
    return [
      {
        title: prefs.discreet ? DISCREET.title : 'Her period started',
        body: prefs.discreet ? DISCREET.body : 'She logged the first day of her period.',
        url: '#/partner',
        tag: `flo-period_started-${today}`,
      },
    ];
  }
  if ((await getSettings())?.role === 'partner') await refreshPartner().catch(() => undefined);
  const { plan } = await currentPlan(prefs, today, today);
  const due = plan.filter((item) => item.date === today);
  const main = due.filter((item) => item.reminder !== 'daily_log');
  const chosen: Planned[] = main.length > 0 ? main : due.slice(0, 1);
  if (chosen.length > 0) await updateNotify({ lastShownOn: today });
  return chosen.map((item) => ({
    title: item.title,
    body: item.body,
    url: item.url,
    tag: `flo-${item.reminder}-${today}`,
  }));
}

async function onPush(kind: string): Promise<void> {
  let notes: Note[] = [];
  try {
    notes = await notesFor(kind);
  } catch {
    // Fall through to the generic notification.
  }
  // iOS requires every push to show a notification.
  for (const note of notes.length > 0 ? notes : [FALLBACK]) {
    await sw.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      icon: '/icons/icon-192.png',
      data: { url: note.url },
    });
  }
  try {
    // Keep the schedule rolling forward.
    await syncReminders(sw.registration);
  } catch {
    // Retried after the next push or app open.
  }
}

sw.addEventListener('push', (event) => {
  let kind = 'tick';
  try {
    const value = (event.data?.json() as { k?: unknown } | undefined)?.k;
    if (typeof value === 'string') kind = value;
  } catch {
    // Not JSON: treat as a plain reminder tick.
  }
  event.waitUntil(onPush(kind));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = String((event.notification.data as { url?: unknown } | null)?.url ?? '#/');
  const target = new URL(`/${hash.startsWith('#') ? hash : '#/'}`, sw.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open !== undefined) {
        await open.focus();
        await open.navigate(target).catch(() => undefined);
      } else {
        await sw.clients.openWindow(target);
      }
    })(),
  );
});
