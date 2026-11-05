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
import {
  DELETE_ALL_REQUEST_EVENT,
  runLocalDataWipe,
  type LocalWipeResult,
} from '../data/wipe/index.ts';
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
import { OnboardingIntro, type OnboardingRole } from '../ui/screens/onboarding/index.ts';
import { DeleteResultScreen } from '../ui/screens/settings/delete/delete-screen.tsx';
import { createAppUpdateCoordinator, type AppUpdateCoordinator } from './update-coordinator.ts';
import { runEngineInWorker } from './engine-runner.ts';
import {
  initializeUnlockedPreview,
  isUnlockedPreviewEnabled,
  PREVIEW_DATABASE_NAME,
  type PreviewBootstrapFailure,
} from './unlocked-preview.ts';

export const APP_AUTO_LOCK_TIMEOUT_MS = 60_000;

type RuntimeState =
  | 'starting'
  | 'onboarding'
  | 'onboarding-lock'
  | 'locked'
  | 'opening'
  | 'ready'
  | 'deleting'
  | 'delete-result'
  | 'error';

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

function initialLockService(databaseName: string): LockService {
  return createLockService({ persistence: new IndexedDbLockPersistence(databaseName) });
}

function previewFailureMessage(reason: PreviewBootstrapFailure): string {
  switch (reason) {
    case 'cancelled':
      return 'Opening the unlocked preview was interrupted. No data was reset.';
    case 'lock_unavailable':
      return 'The unlocked preview could not coordinate other browser tabs. No data was reset.';
    case 'storage_unavailable':
      return 'The unlocked preview credential storage is unavailable. No data was reset or overwritten.';
    case 'state_unavailable':
      return 'The unlocked preview could not read its saved setup safely. No data was reset.';
    case 'inconsistent_state':
      return 'The unlocked preview credential and preview store do not match. No data was reset or overwritten.';
    case 'setup_failed':
      return 'The unlocked preview could not finish its lock setup. No existing data was reset.';
    case 'unlock_failed':
      return 'The unlocked preview could not unlock its preview store. No data was reset.';
  }
}

export function AppRuntime() {
  const unlockedPreview = isUnlockedPreviewEnabled();
  const databaseName = unlockedPreview ? PREVIEW_DATABASE_NAME : DATABASE_NAME;
  const serviceRef = useRef<LockService | null>(null);
  if (serviceRef.current === null) serviceRef.current = initialLockService(databaseName);
  const service = serviceRef.current;

  const [runtimeState, setRuntimeState] = useState<RuntimeState>('starting');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateReadyNotice | null>(null);
  const [restartStatus, setRestartStatus] = useState<'ready' | 'saving' | 'restarting'>('ready');
  const [onboardingRole, setOnboardingRole] = useState<OnboardingRole | null>(null);
  const [sessionOnboardingComplete, setSessionOnboardingComplete] = useState(false);
  const resourcesRef = useRef<AppRuntimeResources | null>(null);
  const showAppRef = useRef<() => void>(() => undefined);
  const resumePreviewRef = useRef<() => void>(() => undefined);
  const restartStatusRef = useRef<'ready' | 'saving' | 'restarting'>('ready');
  const previewResumeInProgress = useRef(false);
  const previewIntroPending = useRef(false);
  const preventPreviewResume = useRef(false);
  const deleteInProgress = useRef(false);
  const deleteRequest = useRef<() => void>(() => undefined);
  const [deleteResult, setDeleteResult] = useState<LocalWipeResult | null>(null);
  const syntheticPreview = new URLSearchParams(window.location.search).get('today') === 'synthetic';

  useEffect(() => {
    let mounted = true;
    let windowReady = false;
    let resumePreview: () => void = () => undefined;
    let stopAutoLock: () => void = () => undefined;
    const previewAbort = new AbortController();
    const coordinator = createAppUpdateCoordinator({
      onPreparing: () => {
        restartStatusRef.current = 'saving';
        if (mounted) setRestartStatus('saving');
      },
      onLocked: () => {
        restartStatusRef.current = 'restarting';
        if (mounted) setRestartStatus('restarting');
        service.lock('manual');
      },
      onCancelled: () => {
        restartStatusRef.current = 'ready';
        if (mounted) setRestartStatus('ready');
        if (unlockedPreview && !service.isUnlocked()) resumePreview();
      },
    });
    const unsubscribe = service.onLock(() => {
      const resources = resourcesRef.current;
      resources?.lifecycle.close();
      if (resources) resources.repositories = null;
      if (!mounted || !windowReady) return;
      setRuntimeError(null);
      if (
        unlockedPreview &&
        !deleteInProgress.current &&
        !preventPreviewResume.current &&
        restartStatusRef.current === 'ready'
      ) {
        resumePreview();
        return;
      }
      if (unlockedPreview && preventPreviewResume.current && !deleteInProgress.current) return;
      setRuntimeState('locked');
    });

    if (!unlockedPreview) {
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
    }

    const handleDeleteRequest = () => deleteRequest.current();
    window.addEventListener(DELETE_ALL_REQUEST_EVENT, handleDeleteRequest);

    const lifecycle = createLockStoreLifecycle(service, async (keys) => {
      const crypto = createCryptoApi();
      const migrations = createMigrationRunner({
        databaseName,
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
        databaseName,
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

    resumePreview = () => {
      if (
        !mounted ||
        !windowReady ||
        restartStatusRef.current !== 'ready' ||
        previewResumeInProgress.current ||
        preventPreviewResume.current ||
        deleteInProgress.current
      ) {
        return;
      }
      let finishWrite: () => void;
      try {
        finishWrite = coordinator.beginWrite();
      } catch {
        if (restartStatusRef.current !== 'ready') return;
        preventPreviewResume.current = true;
        if (service.isUnlocked()) service.lock('manual');
        setRuntimeError('The unlocked preview could not coordinate its storage safely.');
        setRuntimeState('error');
        return;
      }
      previewResumeInProgress.current = true;
      setRuntimeError(null);
      setRuntimeState('opening');
      void initializeUnlockedPreview(service, { signal: previewAbort.signal })
        .then((result) => {
          if (!mounted) return;
          if (result.status === 'error') {
            preventPreviewResume.current = true;
            setRuntimeError(previewFailureMessage(result.reason));
            setRuntimeState('error');
            return;
          }
          if (result.firstRun && !syntheticPreview) previewIntroPending.current = true;
          if (restartStatusRef.current !== 'ready') return;
          if (previewIntroPending.current) {
            setRuntimeState('onboarding');
          } else {
            showAppRef.current();
          }
        })
        .catch(() => {
          if (!mounted) return;
          preventPreviewResume.current = true;
          if (service.isUnlocked()) service.lock('manual');
          setRuntimeError('The unlocked preview could not start safely. No data was reset.');
          setRuntimeState('error');
        })
        .finally(() => {
          previewResumeInProgress.current = false;
          finishWrite();
        });
    };
    resumePreviewRef.current = resumePreview;

    void coordinator
      .start()
      .then(async () => {
        if (!mounted) return;
        if (unlockedPreview) {
          windowReady = true;
          window.floAppUpdate = { beginWrite: coordinator.beginWrite };
          resumePreview();
        } else {
          const setupState = await service.setupState();
          if (!mounted) return;
          windowReady = true;
          window.floAppUpdate = { beginWrite: coordinator.beginWrite };
          setRuntimeState(
            setupState === 'not_configured' && !syntheticPreview ? 'onboarding' : 'locked',
          );
        }
        void registerServiceWorker({
          writeCoordinator: coordinator,
          onUpdateReady: (notice) => {
            if (!mounted) return;
            setUpdateNotice(notice);
            if (!unlockedPreview || restartStatusRef.current === 'ready') {
              restartStatusRef.current = 'ready';
              setRestartStatus('ready');
            }
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
      previewAbort.abort();
      resumePreviewRef.current = () => undefined;
      window.removeEventListener(DELETE_ALL_REQUEST_EVENT, handleDeleteRequest);
      stopAutoLock();
      if (window.floAppUpdate?.beginWrite === coordinator.beginWrite) {
        delete window.floAppUpdate;
      }
      if (unlockedPreview || service.isUnlocked()) service.lock('cold_start');
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
        if (unlockedPreview) {
          preventPreviewResume.current = true;
          service.lock('manual');
          setRuntimeError('The unlocked preview store could not be opened safely. No data was reset.');
          setRuntimeState('error');
          return;
        }
        service.lock('manual');
        setRuntimeError('The encrypted store could not be opened safely. Try unlocking again.');
        setRuntimeState('locked');
      });
  };

  const beginLockSetup = (role: OnboardingRole) => {
    setOnboardingRole(role);
    if (unlockedPreview) {
      previewIntroPending.current = false;
      if (service.isUnlocked() && restartStatusRef.current === 'ready') {
        showAppRef.current();
      } else {
        resumePreviewRef.current();
      }
      return;
    }
    setRuntimeState('onboarding-lock');
  };

  const deleteAll = async () => {
    if (deleteInProgress.current) return;
    deleteInProgress.current = true;
    const resources = resourcesRef.current;
    resources?.lifecycle.close();
    if (resources) resources.repositories = null;
    setRuntimeError(null);
    service.lock('manual');
    setRuntimeState('deleting');

    const result = await runLocalDataWipe();
    setDeleteResult(result);
    setRuntimeState('delete-result');
  };

  deleteRequest.current = () => {
    void deleteAll();
  };

  const continueToFreshSetup = () => {
    window.location.replace(window.location.pathname);
  };

  if (runtimeState === 'deleting') {
    return (
      <main class="app-runtime-message">
        <p role="status">Removing local data from this device...</p>
      </main>
    );
  }

  if (runtimeState === 'delete-result' && deleteResult !== null) {
    return <DeleteResultScreen result={deleteResult} onContinue={continueToFreshSetup} />;
  }

  showAppRef.current = showApp;

  if (runtimeState === 'ready') {
    const resources = resourcesRef.current;
    if (!resources || resources.repositories === null) return null;
    return (
      <AppShell
        repositories={resources.repositories}
        engineRunner={runEngineInWorker}
        {...(onboardingRole === null ? {} : { initialOnboardingRole: onboardingRole })}
        sessionOnboardingComplete={sessionOnboardingComplete}
        onOnboardingComplete={() => setSessionOnboardingComplete(true)}
        updateNotice={updateNotice}
        restartStatus={restartStatus}
        cancelRestart={() => resources.coordinator.cancelRestart()}
        unlockedPreview={unlockedPreview}
      />
    );
  }

  if (runtimeState === 'onboarding') {
    return <OnboardingIntro onRoleSelected={beginLockSetup} unlockedPreview={unlockedPreview} />;
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
          {runtimeState === 'starting'
            ? 'Starting this device…'
            : unlockedPreview
              ? 'Opening the unlocked preview store…'
              : 'Opening the encrypted store…'}
        </p>
        {unlockedPreview ? (
          <p class="app-runtime-preview-warning" role="note">
            Unlocked development preview: no passphrase protection. Use synthetic data only.
          </p>
        ) : null}
      </main>
    );
  }

  if (runtimeState === 'locked' && unlockedPreview) {
    return (
      <main class="app-runtime-message">
        <p role="status">
          {restartStatus === 'restarting'
            ? 'The app is locked while the update restarts.'
            : 'Reopening the unlocked preview…'}
        </p>
        <p class="app-runtime-preview-warning" role="note">
          Unlocked development preview: no passphrase protection. Use synthetic data only.
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
