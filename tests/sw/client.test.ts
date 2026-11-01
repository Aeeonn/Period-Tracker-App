// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUpdateWriteGate,
  registerServiceWorker,
  validateServiceWorkerScriptURL,
  type RestartReadiness,
  type ServiceWorkerClientOptions,
} from '../../src/sw/client.ts';

const readiness: RestartReadiness = {
  writesFlushed: true,
  transactionsClosed: true,
  appLocked: true,
  writesBlocked: true,
};

class ServiceWorkerHarness extends EventTarget {
  readonly postedMessages: unknown[] = [];
  state = 'installed';
  container!: ServiceWorkerContainerHarness;
  buildId = 'synthetic-build-v2';

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
    if (typeof message !== 'object' || message === null) return;
    const request = message as { type?: unknown; requestId?: unknown };
    if (request.type === 'GET_BUILD_ID') {
      this.container.message(
        { type: 'WORKER_BUILD_ID', requestId: request.requestId, buildId: this.buildId },
        this,
      );
    }
    if (request.type === 'SKIP_WAITING') {
      this.container.message(
        {
          type: 'ACTIVATION_REQUEST_ACCEPTED',
          requestId: request.requestId,
          buildId: this.buildId,
        },
        this,
      );
      this.container.message({ type: 'SW_ACTIVATED', buildId: this.buildId }, this);
      this.container.dispatchEvent(new Event('controllerchange'));
    }
  }
}

class ServiceWorkerRegistrationHarness extends EventTarget {
  readonly active = {} as ServiceWorker;
  waiting: ServiceWorkerHarness | null = null;
  installing: ServiceWorkerHarness | null = null;
}

class ServiceWorkerContainerHarness extends EventTarget {
  controller: ServiceWorker | null = {} as ServiceWorker;
  readonly registration = new ServiceWorkerRegistrationHarness();
  readonly registrations: Array<{ scriptURL: string; options: unknown }> = [];
  worker!: ServiceWorkerHarness;

  async register(scriptURL: string, options: unknown): Promise<ServiceWorkerRegistration> {
    this.registrations.push({ scriptURL, options });
    return this.registration as unknown as ServiceWorkerRegistration;
  }

  message(data: unknown, source: ServiceWorkerHarness): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: source as unknown as MessageEventSource,
      }),
    );
  }
}

function installWorkerEnvironment() {
  const container = new ServiceWorkerContainerHarness();
  const worker = new ServiceWorkerHarness();
  worker.container = container;
  container.worker = worker;
  container.registration.waiting = worker;
  vi.stubGlobal('navigator', {
    serviceWorker: container,
  });
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  return { container, worker, reload };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('update write gate', () => {
  it('drains an existing write once, blocks new writes, and resumes only when cancelled', async () => {
    const onPreparing = vi.fn();
    const onLocked = vi.fn();
    const onCancelled = vi.fn();
    const gate = createUpdateWriteGate({ onPreparing, onLocked, onCancelled });
    const releaseWrite = gate.beginWrite();
    const preparation = gate.prepareForRestart();

    expect(onPreparing).toHaveBeenCalledOnce();
    expect(onLocked).not.toHaveBeenCalled();
    expect(() => gate.beginWrite()).toThrow('Writes are paused while the app restarts.');
    releaseWrite();
    releaseWrite();
    await expect(preparation).resolves.toEqual(readiness);
    expect(onLocked).toHaveBeenCalledOnce();

    gate.cancelRestart();
    expect(onCancelled).toHaveBeenCalledOnce();
    const releaseAfterCancel = gate.beginWrite();
    releaseAfterCancel();
  });

  it('reopens the write gate and reports cancellation when preparation throws', async () => {
    const failure = new Error('synthetic app lock failure');
    const onPreparing = vi.fn();
    const onCancelled = vi.fn();
    const gate = createUpdateWriteGate({
      onPreparing,
      onLocked: () => {
        throw failure;
      },
      onCancelled,
    });

    await expect(gate.prepareForRestart()).rejects.toBe(failure);
    expect(onPreparing).toHaveBeenCalledOnce();
    expect(onCancelled).toHaveBeenCalledOnce();
    const release = gate.beginWrite();
    release();
  });
});

describe('service worker update client', () => {
  it('registers only the root worker and reloads after the ready build activates and controls the page', async () => {
    const { container, worker, reload } = installWorkerEnvironment();
    let noticeResolve!: (notice: Parameters<ServiceWorkerClientOptions['onUpdateReady']>[0]) => void;
    const deferredNotice = new Promise<Parameters<ServiceWorkerClientOptions['onUpdateReady']>[0]>(
      (resolve) => {
        noticeResolve = resolve;
      },
    );
    const onUpdateReady = vi.fn(
      (notice: Parameters<ServiceWorkerClientOptions['onUpdateReady']>[0]) =>
        noticeResolve(notice),
    );
    const coordinator = {
      prepareForRestart: vi.fn(async () => readiness),
      cancelRestart: vi.fn(),
    };

    await registerServiceWorker({ onUpdateReady, writeCoordinator: coordinator });
    const notice = await deferredNotice;
    expect(container.registrations).toEqual([
      { scriptURL: '/sw.js', options: { scope: '/', updateViaCache: 'none' } },
    ]);
    expect(notice.message).toContain('An update is ready.');

    await expect(notice.restartNow()).resolves.toBe(true);
    expect(coordinator.prepareForRestart).toHaveBeenCalledOnce();
    expect(worker.postedMessages).toEqual([
      expect.objectContaining({ type: 'GET_BUILD_ID' }),
      {
        type: 'SKIP_WAITING',
        requestId: expect.any(String),
        writesFlushed: true,
        transactionsClosed: true,
        appLocked: true,
        writesBlocked: true,
      },
    ]);
    expect(reload).toHaveBeenCalledOnce();
    expect(onUpdateReady).toHaveBeenCalledOnce();
  });

  it('does not request activation when the page is uncontrolled or writes are not fully ready', async () => {
    const { container, worker } = installWorkerEnvironment();
    let notify!: Parameters<ServiceWorkerClientOptions['onUpdateReady']>[0];
    const onUpdateReady = (notice: Parameters<ServiceWorkerClientOptions['onUpdateReady']>[0]) => {
      notify = notice;
    };
    const coordinator = {
      prepareForRestart: vi.fn(async () => readiness),
      cancelRestart: vi.fn(),
    };
    await registerServiceWorker({ onUpdateReady, writeCoordinator: coordinator });
    for (let attempt = 0; attempt < 20 && !notify; attempt += 1) await Promise.resolve();
    if (!notify) throw new Error('Installed worker did not report its update.');

    container.controller = null;
    await expect(notify.restartNow()).resolves.toBe(false);
    expect(coordinator.prepareForRestart).not.toHaveBeenCalled();

    container.controller = {} as ServiceWorker;
    coordinator.prepareForRestart.mockResolvedValue({
      writesFlushed: true,
      transactionsClosed: true,
      appLocked: false,
      writesBlocked: true,
    } as unknown as RestartReadiness);
    await expect(notify.restartNow()).resolves.toBe(false);
    expect(worker.postedMessages.filter((message) =>
      (message as { type?: unknown }).type === 'SKIP_WAITING',
    )).toHaveLength(0);
  });

  it('returns null when service workers are unavailable and rejects non-root script URLs', async () => {
    vi.stubGlobal('navigator', {});
    await expect(
      registerServiceWorker({
        onUpdateReady: vi.fn(),
        writeCoordinator: { prepareForRestart: vi.fn(async () => readiness) },
      }),
    ).resolves.toBeNull();
    expect(() => validateServiceWorkerScriptURL('/sw.js')).not.toThrow();
    expect(() => validateServiceWorkerScriptURL('/nested/sw.js')).toThrow(
      'Only the same-origin /sw.js service-worker script is permitted.',
    );
  });
});
