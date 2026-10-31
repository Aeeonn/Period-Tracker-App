import { useEffect, useRef, useState } from 'preact/hooks';
import type { LockService } from '../contracts/lock.ts';
import { createCryptoApi } from '../crypto/primitives/index.ts';
import { createLogRepo, createSettingsRepo, createHlcClock } from '../data/repos/index.ts';
import { ensureDeviceIdentity } from './device-identity.ts';
import type { Repositories } from '../ui/layout/repositories.tsx';
import { createMigrationRunner } from '../data/migrations/index.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../data/migrations/registry.ts';
import { openRecordStore, type OpenRecordStore } from '../data/store/store.ts';
import { DATABASE_NAME } from '../data/store/schema.ts';
import type { LockStoreLifecycle } from '../lock/core/store-lifecycle.ts';
import {
  attachAutoLock,
  createLockService,
  createLockStoreLifecycle,
  IndexedDbLockPersistence,
} from '../lock/core/index.ts';
import { registerServiceWorker, type UpdateReadyNotice } from '../sw/client.ts';
import { AppShell } from '../ui/layout/app.tsx';
import { LockScreen } from '../ui/screens/lock/core/lock-screen.tsx';
import { createAppUpdateCoordinator, type AppUpdateCoordinator } from './update-coordinator.ts';

export const APP_AUTO_LOCK_TIMEOUT_MS = 60_000;

type RuntimeState = 'starting' | 'locked' | 'opening' | 'ready' | 'error';

interface AppUpdateApi {
  beginWrite(): () => void;
}

interface AppRuntimeResources {
  readonly coordinator: AppUpdateCoordinator;
  readonly lifecycle: LockStoreLifecycle<OpenRecordStore>;
  repositories: Repositories | null;
}

declare global {
  interface Window {
    floAppUpdate?: AppUpdateApi;
  }
}

function initialLockService(): LockService {
  return createLockService({ persistence: new IndexedDbLockPersistence(DATABASE_NAME) });
}

export function AppRuntime() {
  const serviceRef = useRef<LockService | null>(null);
  if (serviceRef.current === null) serviceRef.current = initialLockService();
  const service = serviceRef.current;

  const [runtimeState, setRuntimeState] = useState<RuntimeState>('starting');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateReadyNotice | null>(null);
  const [restartStatus, setRestartStatus] = useState<'ready' | 'saving' | 'restarting'>('ready');
  const resourcesRef = useRef<AppRuntimeResources | null>(null);

  useEffect(() => {
    let mounted = true;
    let windowReady = false;
    let stopAutoLock: () => void = () => undefined;
    const coordinator = createAppUpdateCoordinator({
      onPreparing: () => {
        if (mounted) setRestartStatus('saving');
      },
      onLocked: () => {
        if (mounted) setRestartStatus('restarting');
        service.lock('manual');
      },
      onCancelled: () => {
        if (mounted) setRestartStatus('ready');
      },
    });
    const unsubscribe = service.onLock(() => {
      const resources = resourcesRef.current;
      resources?.lifecycle.close();
      if (resources) resources.repositories = null;
      if (mounted && windowReady) {
        setRuntimeError(null);
        setRuntimeState('locked');
      }
    });

    try {
      stopAutoLock = attachAutoLock(service, { timeoutMs: APP_AUTO_LOCK_TIMEOUT_MS });
    } catch {
      setRuntimeError('This device could not start the app lock.');
      setRuntimeState('error');
      return () => {
        mounted = false;
        unsubscribe();
        coordinator.dispose();
      };
    }

    const lifecycle = createLockStoreLifecycle(service, async (keys) => {
      const crypto = createCryptoApi();
      const migrations = createMigrationRunner({
        databaseName: DATABASE_NAME,
        schemaVersion: SCHEMA_VERSION,
        steps: MIGRATIONS,
        crypto,
        indexKey: keys.indexKey,
        keyProvider: keys.keyProvider,
        writeCoordinator: coordinator,
      });
      const outcome = await migrations.run();
      if (outcome.status === 'failed') {
        throw new Error('The saved store migration did not complete.');
      }

      const store = await openRecordStore({
        databaseName: DATABASE_NAME,
        schemaVersion: SCHEMA_VERSION,
        crypto,
        indexKey: keys.indexKey,
        keyProvider: keys.keyProvider,
        writeCoordinator: coordinator,
      });
      if (
        store.status === 'MIGRATION_REQUIRED' ||
        store.status === 'MIGRATION_IN_PROGRESS' ||
        (outcome.status === 'migrated' && store.status !== 'READY')
      ) {
        store.close();
        throw new Error('The encrypted store is not ready after migration.');
      }
      return store;
    });
    const resources: AppRuntimeResources = { coordinator, lifecycle, repositories: null };
    resourcesRef.current = resources;

    void coordinator
      .start()
      .then(() => {
        if (!mounted) return;
        windowReady = true;
        window.floAppUpdate = { beginWrite: coordinator.beginWrite };
        setRuntimeState('locked');
        void registerServiceWorker({
          writeCoordinator: coordinator,
          onUpdateReady: (notice) => {
            if (!mounted) return;
            setUpdateNotice(notice);
            setRestartStatus('ready');
          },
        }).catch(() => undefined);
      })
      .catch(() => {
        if (!mounted) return;
        setRuntimeError('This browser cannot safely coordinate app windows.');
        setRuntimeState('error');
      });

    return () => {
      mounted = false;
      windowReady = false;
      stopAutoLock();
      if (window.floAppUpdate?.beginWrite === coordinator.beginWrite) {
        delete window.floAppUpdate;
      }
      if (service.isUnlocked()) service.lock('cold_start');
      unsubscribe();
      lifecycle.dispose();
      coordinator.dispose();
      resourcesRef.current = null;
    };
  }, [service]);

  const showApp = () => {
    const resources = resourcesRef.current;
    if (!resources) return;
    setRuntimeError(null);
    setRuntimeState('opening');
    void resources.lifecycle
      .open()
      .then(async (store) => {
        const deviceId = await ensureDeviceIdentity(store);
        if (
          resourcesRef.current !== resources ||
          !service.isUnlocked() ||
          resources.lifecycle.current !== store
        ) {
          return;
        }
        const hlcClock = createHlcClock(deviceId);
        resources.repositories = {
          logRepo: createLogRepo(store, { deviceId, hlcClock }),
          settingsRepo: createSettingsRepo(store, { deviceId, hlcClock }),
        };
        setRuntimeState('ready');
      })
      .catch(() => {
        if (!service.isUnlocked()) return;
        service.lock('manual');
        setRuntimeError('The encrypted store could not be opened safely. Try unlocking again.');
        setRuntimeState('locked');
      });
  };

  if (runtimeState === 'ready') {
    const resources = resourcesRef.current;
    if (!resources || resources.repositories === null) return null;
    return (
      <AppShell
        repositories={resources.repositories}
        updateNotice={updateNotice}
        restartStatus={restartStatus}
        cancelRestart={() => resources.coordinator.cancelRestart()}
      />
    );
  }

  if (runtimeState === 'error') {
    return (
      <main class="app-runtime-message">
        <p role="alert">{runtimeError ?? 'The app could not start safely.'}</p>
      </main>
    );
  }

  if (runtimeState === 'opening' || runtimeState === 'starting') {
    return (
      <main class="app-runtime-message">
        <p role="status">
          {runtimeState === 'starting' ? 'Starting this device…' : 'Opening the encrypted store…'}
        </p>
      </main>
    );
  }

  return (
    <>
      {runtimeError ? (
        <p class="app-runtime-error" role="alert">
          {runtimeError}
        </p>
      ) : null}
      <LockScreen
        service={service}
        autoLockTimeoutMs={APP_AUTO_LOCK_TIMEOUT_MS}
        onUnlocked={showApp}
      />
    </>
  );
}
