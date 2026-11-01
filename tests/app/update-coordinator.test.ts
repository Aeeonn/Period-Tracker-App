// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppUpdateCoordinator } from '../../src/app/update-coordinator.ts';

type LockMode = 'shared' | 'exclusive';
interface LockRequest {
  readonly mode: LockMode;
  readonly callback: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

class SharedLockHarness {
  private readonly queue: LockRequest[] = [];
  private sharedCount = 0;
  private exclusiveHeld = false;

  request<T>(
    _name: string,
    options: { readonly mode: LockMode },
    callback: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        mode: options.mode,
        callback,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.exclusiveHeld) return;
    const first = this.queue[0];
    if (!first) return;
    if (first.mode === 'exclusive') {
      if (this.sharedCount !== 0) return;
      this.queue.shift();
      this.exclusiveHeld = true;
      this.grant(first);
      return;
    }
    while (this.queue[0]?.mode === 'shared' && !this.exclusiveHeld) {
      const request = this.queue.shift();
      if (!request) return;
      this.sharedCount += 1;
      this.grant(request);
    }
  }

  private grant(request: LockRequest): void {
    void request.callback().then(request.resolve, request.reject).finally(() => {
      if (request.mode === 'shared') this.sharedCount -= 1;
      else this.exclusiveHeld = false;
      this.drain();
    });
  }
}

class ChannelHarness extends EventTarget {
  static readonly channels: ChannelHarness[] = [];
  closed = false;

  constructor(readonly name: string) {
    super();
    ChannelHarness.channels.push(this);
  }

  postMessage(data: unknown): void {
    for (const peer of ChannelHarness.channels) {
      if (peer !== this && !peer.closed && peer.name === this.name) {
        queueMicrotask(() => {
          peer.dispatchEvent(new MessageEvent('message', { data }));
        });
      }
    }
  }

  close(): void {
    this.closed = true;
  }
}

afterEach(() => {
  for (const channel of ChannelHarness.channels.splice(0)) channel.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('same-origin app update coordination', () => {
  it('drains and locks every live window before an exclusive restart barrier, then restores writes on cancel', async () => {
    const locks = new SharedLockHarness();
    const serviceWorker = new EventTarget();
    vi.stubGlobal('navigator', { locks, serviceWorker });
    vi.stubGlobal('BroadcastChannel', ChannelHarness);
    const firstPreparing = vi.fn();
    const firstLocked = vi.fn();
    const firstCancelled = vi.fn();
    const peerPreparing = vi.fn();
    const peerLocked = vi.fn();
    const peerCancelled = vi.fn();
    const peerActivated = vi.fn();
    const first = createAppUpdateCoordinator({
      channelName: 'synthetic-update-coordination',
      windowLockName: 'synthetic-window-lock',
      onPreparing: firstPreparing,
      onLocked: firstLocked,
      onCancelled: firstCancelled,
    });
    const peer = createAppUpdateCoordinator({
      channelName: 'synthetic-update-coordination',
      windowLockName: 'synthetic-window-lock',
      onPreparing: peerPreparing,
      onLocked: peerLocked,
      onCancelled: peerCancelled,
      onPeerActivated: peerActivated,
    });

    await Promise.all([first.start(), first.start(), peer.start()]);
    const finishPeerWrite = peer.beginWrite();
    const preparing = first.prepareForRestart();
    finishPeerWrite();

    await expect(preparing).resolves.toEqual({
      writesFlushed: true,
      transactionsClosed: true,
      appLocked: true,
      writesBlocked: true,
    });
    expect(firstPreparing).toHaveBeenCalledOnce();
    expect(firstLocked).toHaveBeenCalledOnce();
    expect(peerPreparing).toHaveBeenCalledOnce();
    expect(peerLocked).toHaveBeenCalledOnce();
    expect(() => first.beginWrite()).toThrow(
      'App writes are unavailable until this window holds its shared lock.',
    );
    expect(() => peer.beginWrite()).toThrow(
      'App writes are unavailable until this window holds its shared lock.',
    );

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(peerActivated).toHaveBeenCalledOnce();

    await first.cancelRestart();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(firstCancelled).toHaveBeenCalledOnce();
    expect(peerCancelled).toHaveBeenCalledOnce();
    const firstWrite = first.beginWrite();
    const peerWrite = peer.beginWrite();
    firstWrite();
    peerWrite();

    first.dispose();
    peer.dispose();
    first.dispose();
    expect(ChannelHarness.channels.every((channel) => channel.closed)).toBe(true);
  });

  it('fails closed without Web Locks and returns no readiness before start', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('BroadcastChannel', ChannelHarness);
    const coordinator = createAppUpdateCoordinator({
      onPreparing: vi.fn(),
      onLocked: vi.fn(),
      onCancelled: vi.fn(),
    });

    await expect(coordinator.prepareForRestart()).resolves.toBeNull();
    await expect(coordinator.start()).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Web Locks are required by the app',
    });
    expect(() => coordinator.beginWrite()).toThrow(
      'App writes are unavailable until this window holds its shared lock.',
    );
    coordinator.dispose();
  });
});
