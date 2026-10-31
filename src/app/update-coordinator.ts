import {
  createUpdateWriteGate,
  type RestartReadiness,
  type UpdateWriteCoordinator,
  type UpdateWriteGateCallbacks,
} from '../sw/client.ts';

const DEFAULT_CHANNEL_NAME = 'flo:app-update-coordination';
const DEFAULT_WINDOW_LOCK_NAME = 'flo:app-window-runtime';

type CoordinationMessage = {
  readonly type: 'prepare' | 'cancel' | 'failed';
  readonly requestId: string;
  readonly senderId: string;
};

interface RequestState {
  readonly requestId: string;
  readonly abort: AbortController;
  readonly failed: Promise<boolean>;
  readonly markFailed: () => void;
  promise: Promise<RestartReadiness | null>;
  ready: boolean;
  cancelled: boolean;
  activationStarted: boolean;
  finishing: Promise<void> | null;
}

interface PeerState {
  readonly requestId: string;
  cancelled: boolean;
  prepared: boolean;
  restoring: Promise<void> | null;
}

export interface AppUpdateCoordinator extends UpdateWriteCoordinator {
  beginWrite(): () => void;
  start(): Promise<void>;
  dispose(): void;
  cancelRestart(): Promise<void>;
}

export interface AppUpdateCoordinatorOptions extends UpdateWriteGateCallbacks {
  readonly channelName?: string;
  readonly windowLockName?: string;
  readonly onPeerActivated?: () => void;
}

function isCoordinationMessage(value: unknown): value is CoordinationMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<CoordinationMessage>;
  return (
    (message.type === 'prepare' || message.type === 'cancel' || message.type === 'failed') &&
    typeof message.requestId === 'string' &&
    typeof message.senderId === 'string'
  );
}

function isReady(value: RestartReadiness | null): value is RestartReadiness {
  return (
    value !== null &&
    value.writesFlushed &&
    value.transactionsClosed &&
    value.appLocked &&
    value.writesBlocked
  );
}

/**
 * Coordinates app writes across same-origin windows before a worker update.
 * Each live app window holds a shared Web Lock. An update first asks every
 * peer to drain and lock, then takes the exclusive lock as a fail-closed
 * barrier against sleepers and windows that start during the handoff.
 */
export function createAppUpdateCoordinator(
  options: AppUpdateCoordinatorOptions,
): AppUpdateCoordinator {
  const gate = createUpdateWriteGate(options);
  const clientId = globalThis.crypto.randomUUID();
  const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks;
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(options.channelName ?? DEFAULT_CHANNEL_NAME);
  const lockName = options.windowLockName ?? DEFAULT_WINDOW_LOCK_NAME;
  const peers = new Map<string, PeerState>();
  let sharedRelease: (() => void) | null = null;
  let sharedAttempt: Promise<void> | null = null;
  let exclusiveRelease: (() => void) | null = null;
  let activeRequest: RequestState | null = null;
  let startPromise: Promise<void> | null = null;
  let started = false;
  let disposed = false;

  const post = (message: Omit<CoordinationMessage, 'senderId'>) => {
    channel?.postMessage({ ...message, senderId: clientId } satisfies CoordinationMessage);
  };

  const acquireShared = (): Promise<void> => {
    if (sharedRelease) return Promise.resolve();
    if (sharedAttempt) return sharedAttempt;
    if (!lockManager) {
      return Promise.reject(
        new DOMException('Web Locks are required by the app', 'NotSupportedError'),
      );
    }

    let resolveEntered!: () => void;
    let rejectEntered!: (error: unknown) => void;
    const entered = new Promise<void>((resolve, reject) => {
      resolveEntered = resolve;
      rejectEntered = reject;
    });
    sharedAttempt = entered.finally(() => {
      sharedAttempt = null;
    });
    const request = lockManager.request(lockName, { mode: 'shared' }, async () => {
      await new Promise<void>((resolve) => {
        sharedRelease = resolve;
        resolveEntered();
      });
      sharedRelease = null;
    });
    void request.catch((error: unknown) => {
      if (!sharedRelease) rejectEntered(error);
    });
    return sharedAttempt;
  };

  const releaseShared = () => {
    const release = sharedRelease;
    sharedRelease = null;
    release?.();
  };

  const acquireExclusive = (signal: AbortSignal): Promise<void> => {
    if (!lockManager) {
      return Promise.reject(
        new DOMException('Web Locks are required by the app', 'NotSupportedError'),
      );
    }
    return new Promise<void>((resolve, reject) => {
      let entered = false;
      const request = lockManager.request(lockName, { mode: 'exclusive', signal }, async () => {
        entered = true;
        await new Promise<void>((release) => {
          exclusiveRelease = release;
          resolve();
        });
        exclusiveRelease = null;
      });
      void request.catch((error: unknown) => {
        if (!entered) reject(error);
      });
    });
  };

  const releaseExclusive = () => {
    const release = exclusiveRelease;
    exclusiveRelease = null;
    release?.();
  };

  const restorePeer = (peer: PeerState): Promise<void> => {
    if (peer.restoring) return peer.restoring;
    peer.restoring = (async () => {
      if (!disposed && started && !sharedRelease) await acquireShared();
      if (peer.prepared) gate.cancelRestart();
      peer.prepared = false;
      if (peers.get(peer.requestId) === peer) peers.delete(peer.requestId);
    })();
    return peer.restoring;
  };

  const cancelRequest = (request: RequestState): Promise<void> => {
    if (request.finishing) return request.finishing;
    request.cancelled = true;
    request.finishing = (async () => {
      request.abort.abort();
      releaseExclusive();
      post({ type: 'cancel', requestId: request.requestId });
      if (!disposed && started && !sharedRelease) await acquireShared().catch(() => undefined);
      gate.cancelRestart();
      if (activeRequest === request) activeRequest = null;
    })();
    return request.finishing;
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isCoordinationMessage(event.data) || event.data.senderId === clientId) return;
    const message = event.data;

    if (message.type === 'failed') {
      if (activeRequest?.requestId === message.requestId) activeRequest.markFailed();
      return;
    }

    if (message.type === 'cancel') {
      const peer = peers.get(message.requestId);
      if (!peer) return;
      peer.cancelled = true;
      if (peer.prepared) void restorePeer(peer);
      return;
    }

    if (peers.has(message.requestId) || !started || disposed) return;
    const peer: PeerState = {
      requestId: message.requestId,
      cancelled: false,
      prepared: false,
      restoring: null,
    };
    peers.set(message.requestId, peer);
    void (async () => {
      try {
        const readiness = await gate.prepareForRestart();
        if (!isReady(readiness)) {
          post({ type: 'failed', requestId: message.requestId });
          peers.delete(message.requestId);
          return;
        }
        peer.prepared = true;
        if (peer.cancelled) {
          await restorePeer(peer);
          return;
        }
        releaseShared();
      } catch {
        post({ type: 'failed', requestId: message.requestId });
        peers.delete(message.requestId);
      }
    })();
  };

  const onControllerChange = () => {
    if (activeRequest?.ready) {
      activeRequest.activationStarted = true;
      return;
    }
    if ([...peers.values()].some((peer) => peer.prepared)) {
      (options.onPeerActivated ?? (() => window.location.reload()))();
    }
  };

  const onPageHide = () => {
    const request = activeRequest;
    if (request && !request.activationStarted) {
      request.cancelled = true;
      request.abort.abort();
      post({ type: 'cancel', requestId: request.requestId });
      releaseExclusive();
      gate.cancelRestart();
      activeRequest = null;
    }
    releaseShared();
  };

  channel?.addEventListener('message', onMessage);

  return {
    beginWrite() {
      if (!started || !sharedRelease || disposed) {
        throw new Error('App writes are unavailable until this window holds its shared lock.');
      }
      return gate.beginWrite();
    },
    async start() {
      if (startPromise) return startPromise;
      if (!lockManager) {
        throw new DOMException('Web Locks are required by the app', 'NotSupportedError');
      }
      startPromise = (async () => {
        await acquireShared();
        if (disposed) throw new DOMException('App update coordinator is disposed', 'AbortError');
        started = true;
        window.addEventListener('pagehide', onPageHide);
        navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
      })();
      try {
        await startPromise;
      } catch (error) {
        startPromise = null;
        throw error;
      }
    },
    async prepareForRestart() {
      if (!started || disposed || !channel || !sharedRelease) return null;
      if (activeRequest) return activeRequest.promise;
      if (peers.size > 0) return null;

      let markFailed!: () => void;
      const failed = new Promise<boolean>((resolve) => {
        markFailed = () => resolve(false);
      });
      const request: RequestState = {
        requestId: globalThis.crypto.randomUUID(),
        abort: new AbortController(),
        failed,
        markFailed,
        promise: Promise.resolve(null),
        ready: false,
        cancelled: false,
        activationStarted: false,
        finishing: null,
      };
      activeRequest = request;
      request.promise = (async () => {
        try {
          const readiness = await gate.prepareForRestart();
          if (!isReady(readiness)) {
            if (activeRequest === request) activeRequest = null;
            return null;
          }
          if (request.cancelled) {
            await cancelRequest(request);
            return null;
          }
          post({ type: 'prepare', requestId: request.requestId });
          releaseShared();
          const acquired = await Promise.race([
            acquireExclusive(request.abort.signal).then(() => true),
            request.failed,
          ]);
          if (!acquired || request.cancelled) {
            await cancelRequest(request);
            return null;
          }
          request.ready = true;
          return readiness;
        } catch {
          await cancelRequest(request);
          return null;
        }
      })();
      return request.promise;
    },
    async cancelRestart() {
      const request = activeRequest;
      if (request) {
        if (request.ready) {
          await cancelRequest(request);
          return;
        }
        request.cancelled = true;
        request.abort.abort();
        await request.promise;
        return;
      }
      if (!disposed && started && !sharedRelease) await acquireShared();
      gate.cancelRestart();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      channel?.removeEventListener('message', onMessage);
      const request = activeRequest;
      if (request && !request.activationStarted) {
        post({ type: 'cancel', requestId: request.requestId });
        request.abort.abort();
        releaseExclusive();
        gate.cancelRestart();
      }
      activeRequest = null;
      releaseShared();
      releaseExclusive();
      channel?.close();
    },
  };
}
