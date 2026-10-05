export interface RestartReadiness {
  writesFlushed: true;
  transactionsClosed: true;
  appLocked: true;
  writesBlocked: true;
}

/**
 * The app adapter must atomically stop new writes, drain its write queue, wait for
 * every storage transaction to finish, and lock the app before returning ready.
 * If other app windows share the same store, the app adapter must include their
 * writes too. Keep writes blocked until the page is replaced by the activated worker.
 */
export interface UpdateWriteCoordinator {
  prepareForRestart(): Promise<RestartReadiness | null>;
  cancelRestart?(): void | Promise<void>;
}

export interface UpdateWriteGate extends UpdateWriteCoordinator {
  beginWrite(): () => void;
  cancelRestart(): void;
}

export interface UpdateWriteGateCallbacks {
  onPreparing(): void;
  onLocked(): void;
  onCancelled(): void;
}

/** Create the app-side barrier; a write lease must end only after its transaction completes. */
export function createUpdateWriteGate(callbacks: UpdateWriteGateCallbacks): UpdateWriteGate {
  let acceptingWrites = true;
  let pendingWrites = 0;
  let restartReady = false;
  let preparation: Promise<RestartReadiness | null> | null = null;
  let drainWaiters: Array<() => void> = [];

  const cancelRestart = () => {
    if (!restartReady) return;
    restartReady = false;
    acceptingWrites = true;
    callbacks.onCancelled();
  };

  return {
    beginWrite() {
      if (!acceptingWrites) throw new Error('Writes are paused while the app restarts.');
      pendingWrites += 1;
      let finished = false;

      return () => {
        if (finished) return;
        finished = true;
        pendingWrites -= 1;
        if (pendingWrites !== 0) return;
        const waiters = drainWaiters;
        drainWaiters = [];
        for (const resolve of waiters) resolve();
      };
    },
    async prepareForRestart() {
      if (preparation) return preparation;
      if (!acceptingWrites) return null;

      acceptingWrites = false;
      preparation = (async () => {
        try {
          callbacks.onPreparing();
          if (pendingWrites > 0) {
            await new Promise<void>((resolve) => drainWaiters.push(resolve));
          }
          callbacks.onLocked();
          restartReady = true;
          return {
            writesFlushed: true,
            transactionsClosed: true,
            appLocked: true,
            writesBlocked: true,
          } as const;
        } catch (error) {
          acceptingWrites = true;
          callbacks.onCancelled();
          throw error;
        }
      })();

      try {
        return await preparation;
      } finally {
        preparation = null;
      }
    },
    cancelRestart,
  };
}

export interface UpdateReadyNotice {
  message: string;
  restartNow(): Promise<boolean>;
}

export interface ServiceWorkerClientOptions {
  onUpdateReady(notice: UpdateReadyNotice): void;
  writeCoordinator: UpdateWriteCoordinator;
}

interface WorkerMessage {
  type?: unknown;
  buildId?: unknown;
  message?: unknown;
  requestId?: unknown;
}

const UPDATE_READY_MESSAGE = 'An update is ready. Save your changes before restarting.';

function isWorkerMessage(value: unknown): value is WorkerMessage {
  return typeof value === 'object' && value !== null;
}

function isRestartReady(value: RestartReadiness | null): value is RestartReadiness {
  return (
    value !== null &&
    value.writesFlushed === true &&
    value.transactionsClosed === true &&
    value.appLocked === true &&
    value.writesBlocked === true
  );
}

function requestId(): string {
  return crypto.randomUUID();
}

function getBuildId(waitingWorker: ServiceWorker): Promise<string | null> {
  const id = requestId();

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        !isWorkerMessage(event.data) ||
        event.data.type !== 'WORKER_BUILD_ID' ||
        event.data.requestId !== id
      ) {
        return;
      }

      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(typeof event.data.buildId === 'string' ? event.data.buildId : null);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    waitingWorker.postMessage({ type: 'GET_BUILD_ID', requestId: id });
  });
}

async function requestSafeRestart(
  registration: ServiceWorkerRegistration,
  waitingWorker: ServiceWorker,
  buildId: string,
  coordinator: UpdateWriteCoordinator,
): Promise<boolean> {
  if (navigator.serviceWorker.controller === null) return false;

  let readiness: RestartReadiness | null;
  try {
    readiness = await coordinator.prepareForRestart();
  } catch {
    return false;
  }
  if (!isRestartReady(readiness)) return false;
  if (registration.waiting !== waitingWorker || navigator.serviceWorker.controller === null) {
    await coordinator.cancelRestart?.();
    return false;
  }

  const id = requestId();

  return new Promise<boolean>((resolve) => {
    let accepted = false;
    let activated = false;
    let controllerChanged = false;
    let settled = false;

    const cleanup = () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };

    const finishIfReady = () => {
      if (!accepted || !activated || !controllerChanged || settled) return;
      settled = true;
      cleanup();
      window.location.reload();
      resolve(true);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isWorkerMessage(event.data)) return;

      if (
        event.data.type === 'ACTIVATION_REQUEST_ACCEPTED' &&
        event.data.requestId === id &&
        event.data.buildId === buildId
      ) {
        accepted = true;
      }

      if (event.data.type === 'SW_ACTIVATED' && event.data.buildId === buildId) {
        activated = true;
      }

      finishIfReady();
    };

    const onControllerChange = () => {
      controllerChanged = true;
      finishIfReady();
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    try {
      waitingWorker.postMessage({
        type: 'SKIP_WAITING',
        requestId: id,
        writesFlushed: true,
        transactionsClosed: true,
        appLocked: true,
        writesBlocked: true,
      });
    } catch {
      cleanup();
      void coordinator.cancelRestart?.();
      resolve(false);
    }
  });
}

/** Register the shell worker and report an installed update without activating it. */
export async function registerServiceWorker(
  options: ServiceWorkerClientOptions,
): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  const notifiedWorkers = new WeakSet<ServiceWorker>();

  const notifyIfWaiting = async (waitingWorker: ServiceWorker | null, knownBuildId?: string) => {
    if (
      !waitingWorker ||
      waitingWorker.state !== 'installed' ||
      notifiedWorkers.has(waitingWorker) ||
      !registration.active
    ) {
      return;
    }

    const buildId = knownBuildId ?? (await getBuildId(waitingWorker));
    if (!buildId || registration.waiting !== waitingWorker) return;

    notifiedWorkers.add(waitingWorker);
    let restartRequest: Promise<boolean> | null = null;
    options.onUpdateReady({
      message: UPDATE_READY_MESSAGE,
      restartNow: () => {
        if (restartRequest) return restartRequest;
        restartRequest = requestSafeRestart(
          registration,
          waitingWorker,
          buildId,
          options.writeCoordinator,
        )
          .catch(() => false)
          .then((result) => {
            if (!result) restartRequest = null;
            return result;
          });
        return restartRequest;
      },
    });
  };

  const watchInstallingWorker = () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') void notifyIfWaiting(registration.waiting);
    });
  };

  registration.addEventListener('updatefound', watchInstallingWorker);
  watchInstallingWorker();
  void notifyIfWaiting(registration.waiting);

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isWorkerMessage(event.data) || event.data.type !== 'UPDATE_READY') return;
    const waiting = registration.waiting;
    if (!waiting || event.source !== waiting || typeof event.data.buildId !== 'string') return;

    void notifyIfWaiting(waiting, event.data.buildId);
  });

  return registration;
}
