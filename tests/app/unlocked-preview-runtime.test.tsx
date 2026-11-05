// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LockReason, LockService } from '../../src/contracts/lock.ts';
import type {
  AppUpdateCoordinator,
  AppUpdateCoordinatorOptions,
} from '../../src/app/update-coordinator.ts';
import type {
  PreviewBootstrapResult,
  UnlockedPreviewOptions,
} from '../../src/app/unlocked-preview.ts';

const harness = vi.hoisted(() => ({
  unlocked: false,
  listeners: new Set<(reason: LockReason) => void>(),
  bootstrap:
    vi.fn<
      (service: LockService, options?: UnlockedPreviewOptions) => Promise<PreviewBootstrapResult>
    >(),
  lock: vi.fn<(reason: LockReason) => void>(),
  store: { close: vi.fn() },
  lifecycle: {
    current: null as { close(): void } | null,
    open: vi.fn(),
    close: vi.fn(),
    dispose: vi.fn(),
  },
  coordinator: null as AppUpdateCoordinator | null,
}));

vi.mock('../../src/app/unlocked-preview.ts', () => ({
  PREVIEW_DATABASE_NAME: 'synthetic-preview',
  isUnlockedPreviewEnabled: () => true,
  initializeUnlockedPreview: harness.bootstrap,
}));

vi.mock('../../src/lock/core/index.ts', () => ({
  IndexedDbLockPersistence: class {},
  attachAutoLock: () => {
    throw new Error('The unlocked preview must not attach the secured auto-lock');
  },
  createLockService: () => ({
    isUnlocked: () => harness.unlocked,
    onLock: (listener: (reason: LockReason) => void) => {
      harness.listeners.add(listener);
      return () => harness.listeners.delete(listener);
    },
    lock: (reason: LockReason) => {
      harness.lock(reason);
      harness.unlocked = false;
      for (const listener of harness.listeners) listener(reason);
    },
  }),
  createLockStoreLifecycle: () => harness.lifecycle,
}));

vi.mock('../../src/app/update-coordinator.ts', async () => {
  const { createUpdateWriteGate } =
    await vi.importActual<typeof import('../../src/sw/client.ts')>('../../src/sw/client.ts');
  return {
    createAppUpdateCoordinator: (callbacks: AppUpdateCoordinatorOptions) => {
      const gate = createUpdateWriteGate(callbacks);
      const coordinator: AppUpdateCoordinator = {
        ...gate,
        start: async () => undefined,
        dispose: () => undefined,
        cancelRestart: async () => gate.cancelRestart(),
      };
      harness.coordinator = coordinator;
      return coordinator;
    },
  };
});

vi.mock('../../src/sw/client.ts', () => ({
  registerServiceWorker: async () => undefined,
}));

vi.mock('../../src/app/device-identity.ts', () => ({
  ensureDeviceIdentity: async () => 'synthetic-device',
}));

vi.mock('../../src/data/repos/index.ts', () => ({
  createLogRepo: () => ({}),
  createSettingsRepo: () => ({}),
  createHlcClock: () => ({}),
}));

vi.mock('../../src/ui/layout/app.tsx', () => ({
  AppShell: () => <div>Preview app is ready</div>,
}));

vi.mock('../../src/ui/screens/onboarding/index.ts', () => ({
  OnboardingIntro: () => <div>Preview onboarding</div>,
}));

vi.mock('../../src/ui/screens/lock/core/lock-screen.tsx', () => ({
  LockScreen: () => <div>Unexpected passphrase screen</div>,
}));

import { AppRuntime } from '../../src/app/runtime.tsx';

const roots: HTMLElement[] = [];

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error('Preview runtime did not reach the expected state');
}

async function mount(): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(async () => {
    render(<AppRuntime />, root);
  });
  return root;
}

beforeEach(() => {
  harness.unlocked = false;
  harness.listeners.clear();
  harness.bootstrap.mockReset();
  harness.lock.mockClear();
  harness.lifecycle.current = null;
  harness.lifecycle.open.mockReset().mockImplementation(async () => {
    harness.lifecycle.current = harness.store;
    return harness.store;
  });
  harness.lifecycle.close.mockReset().mockImplementation(() => {
    harness.lifecycle.current = null;
  });
  harness.lifecycle.dispose.mockReset();
  harness.coordinator = null;
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
});

describe('unlocked preview update coordination', () => {
  it('drains an in-flight bootstrap before locking and resumes only after cancellation', async () => {
    let finishBootstrap!: () => void;
    harness.bootstrap.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishBootstrap = resolve;
      });
      harness.unlocked = true;
      return { status: 'ready', firstRun: false };
    });
    harness.bootstrap.mockImplementation(async () => {
      harness.unlocked = true;
      return { status: 'ready', firstRun: false };
    });

    const root = await mount();
    await waitFor(() => harness.bootstrap.mock.calls.length === 1 && harness.coordinator !== null);
    const coordinator = harness.coordinator!;
    let settled = false;
    const readiness = coordinator.prepareForRestart().then((result) => {
      settled = true;
      return result;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    expect(harness.lock).not.toHaveBeenCalled();

    await act(async () => {
      finishBootstrap();
      expect(await readiness).toMatchObject({ appLocked: true, writesBlocked: true });
    });
    expect(harness.lock).toHaveBeenCalledWith('manual');
    expect(harness.bootstrap).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.open).not.toHaveBeenCalled();
    expect(root.textContent).toContain('locked while the update restarts');
    expect(root.textContent).not.toContain('Unexpected passphrase screen');

    await act(async () => {
      await coordinator.cancelRestart();
    });
    await waitFor(() => root.textContent?.includes('Preview app is ready') === true);
    expect(harness.bootstrap).toHaveBeenCalledTimes(2);
    expect(harness.lifecycle.open).toHaveBeenCalledOnce();
  });

  it('returns to first-run onboarding after an update is cancelled', async () => {
    harness.bootstrap.mockImplementationOnce(async () => {
      harness.unlocked = true;
      return { status: 'ready', firstRun: true };
    });
    harness.bootstrap.mockImplementation(async () => {
      harness.unlocked = true;
      return { status: 'ready', firstRun: false };
    });

    const root = await mount();
    await waitFor(() => root.textContent?.includes('Preview onboarding') === true);
    const coordinator = harness.coordinator!;
    await act(async () => {
      await coordinator.prepareForRestart();
    });
    await act(async () => {
      await coordinator.cancelRestart();
    });
    await waitFor(() => root.textContent?.includes('Preview onboarding') === true);
    expect(harness.lifecycle.open).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain('Unexpected passphrase screen');
  });

  it('announces preview storage errors instead of showing the passphrase screen', async () => {
    harness.bootstrap.mockResolvedValue({ status: 'error', reason: 'storage_unavailable' });
    const root = await mount();

    await waitFor(() => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No data was reset');
    expect(root.textContent).not.toContain('Unexpected passphrase screen');
  });
});
