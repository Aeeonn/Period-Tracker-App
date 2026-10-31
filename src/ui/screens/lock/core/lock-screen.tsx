import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, TargetedEvent } from 'preact';
import type {
  LockService,
  LockSetupState,
  RecoveryConfirmPositions,
  UnlockSecret,
} from '../../../../contracts/lock.ts';
import { Button, Card, Sheet } from '../../../components/base';
import { isPassphraseLengthAllowed } from '../../../../lock/core/service.ts';

type ScreenMode = 'loading' | 'setup' | 'confirm' | 'resume-setup' | 'locked' | 'unlocked';
type SecretKind = 'passphrase' | 'recovery_code';

export interface LockScreenProps {
  readonly service: LockService;
  readonly autoLockTimeoutMs?: number;
  readonly onUnlocked?: () => void;
}

function timeoutDescription(timeoutMs: number): string {
  const seconds = timeoutMs / 1000;
  const defaultSuffix = timeoutMs === 60_000 ? ' by default' : '';
  if (Number.isInteger(seconds)) {
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}${defaultSuffix}`;
  }
  return `${timeoutMs} milliseconds${defaultSuffix}`;
}

const emptyConfirmation = (): [string, string, string, string] => ['', '', '', ''];

interface RecoverySetupSheetProps {
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly children: ComponentChildren;
}

function RecoverySetupSheet({ busy, children, onClose }: RecoverySetupSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      class="lock-screen__recovery-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div class="lock-screen__recovery-dialog-content">
        <header class="lock-screen__recovery-header">
          <h2 id={titleId}>Save your recovery code</h2>
          <button disabled={busy} onClick={onClose} type="button">
            Discard recovery setup
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function screenForState(state: LockSetupState): ScreenMode {
  if (state === 'pending_confirmation') return 'resume-setup';
  return state === 'configured' ? 'locked' : 'setup';
}

export function LockScreen({ autoLockTimeoutMs = 60_000, onUnlocked, service }: LockScreenProps) {
  const timeoutCopy = timeoutDescription(autoLockTimeoutMs);
  const [mode, setMode] = useState<ScreenMode>('loading');
  const [setupState, setSetupState] = useState<LockSetupState>('not_configured');
  const [setupPassphrase, setSetupPassphrase] = useState('');
  const [setupCode, setSetupCode] = useState<string | null>(null);
  const [confirmPositions, setConfirmPositions] = useState<RecoveryConfirmPositions | null>(null);
  const [confirmation, setConfirmation] = useState(emptyConfirmation);
  const [unlockKind, setUnlockKind] = useState<SecretKind>('passphrase');
  const [unlockSecret, setUnlockSecret] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [authorizationKind, setAuthorizationKind] = useState<SecretKind>('passphrase');
  const [authorization, setAuthorization] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [useRecoveryAuthorization, setUseRecoveryAuthorization] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const recoveryAuthorization = useRef<string | null>(null);
  const unlockSecretRef = useRef<HTMLInputElement>(null);
  const viewGeneration = useRef(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const state = await service.setupState();
      if (!mounted) return;
      setSetupState(state);
      setMode(service.isUnlocked() ? 'unlocked' : screenForState(state));
    };
    const unsubscribe = service.onLock(() => {
      viewGeneration.current += 1;
      recoveryAuthorization.current = null;
      setUseRecoveryAuthorization(false);
      setSetupCode(null);
      setConfirmPositions(null);
      setConfirmation(emptyConfirmation());
      setSetupPassphrase('');
      setUnlockSecret('');
      setAuthorization('');
      setNewPassphrase('');
      setChangeOpen(false);
      setBusy(false);
      setError('');
      setNotice('Locked');
      setMode('loading');
      void refresh();
    });
    void refresh();
    return () => {
      mounted = false;
      recoveryAuthorization.current = null;
      unsubscribe();
    };
  }, [service]);

  useEffect(() => {
    if (mode === 'locked' && error && !busy) unlockSecretRef.current?.focus();
  }, [mode, error, busy]);

  const closeChangeFlow = (open: boolean) => {
    setChangeOpen(open);
    if (!open) {
      recoveryAuthorization.current = null;
      setUseRecoveryAuthorization(false);
      setAuthorization('');
      setNewPassphrase('');
      setError('');
    }
  };

  const startSetup = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const currentView = viewGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await service.setup(setupPassphrase);
      if (currentView !== viewGeneration.current) return;
      setSetupPassphrase('');
      setSetupCode(result.recoveryCode);
      setConfirmPositions(result.confirmPositions);
      setConfirmation(emptyConfirmation());
      setSetupState('pending_confirmation');
      setMode('confirm');
      setNotice('');
    } catch {
      if (currentView === viewGeneration.current) {
        setError('The passphrase could not be set up. Check it and try again.');
      }
    } finally {
      if (currentView === viewGeneration.current) setBusy(false);
    }
  };

  const confirmSetup = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const currentView = viewGeneration.current;
    setBusy(true);
    setError('');
    try {
      const result = await service.confirmSetup(confirmation);
      if (currentView !== viewGeneration.current) {
        const state = await service.setupState();
        setSetupState(state);
        const unlocked = service.isUnlocked();
        setMode(unlocked ? 'unlocked' : screenForState(state));
        if (unlocked) onUnlocked?.();
        return;
      }
      if (!result.ok) {
        if (result.error === 'wrong_confirmation') {
          setError('Those characters did not match. Check the code and try again.');
        } else {
          setSetupCode(null);
          setConfirmPositions(null);
          setMode('setup');
          setSetupState('not_configured');
          setError('This setup ended before confirmation. Start again for a new code.');
        }
        return;
      }
      setSetupCode(null);
      setConfirmPositions(null);
      setSetupState('configured');
      setMode('unlocked');
      setNotice('Lock setup is complete.');
      onUnlocked?.();
    } catch {
      if (currentView === viewGeneration.current) {
        setError('Setup could not be saved. Your code is still available to retry.');
      }
    } finally {
      if (currentView === viewGeneration.current) setBusy(false);
    }
  };

  const restartSetup = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    await startSetup(event);
  };

  const unlock = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const currentView = viewGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    const secret: UnlockSecret =
      unlockKind === 'passphrase'
        ? { kind: 'passphrase', passphrase: unlockSecret }
        : { kind: 'recovery_code', code: unlockSecret };
    try {
      const result = await service.unlock(secret);
      if (currentView !== viewGeneration.current) return;
      if (!result.ok) {
        setError(
          result.error === 'unsupported'
            ? 'That unlock method is not set up for this device.'
            : 'That secret did not unlock this device. Try again.',
        );
        setUnlockSecret('');
        unlockSecretRef.current?.focus();
        return;
      }
      setUnlockSecret('');
      setSetupState('configured');
      setMode('unlocked');
      if (unlockKind === 'recovery_code') {
        recoveryAuthorization.current = unlockSecret;
        setAuthorizationKind('recovery_code');
        setUseRecoveryAuthorization(true);
        setChangeOpen(true);
        setNotice('You are unlocked. Set a new passphrase to finish recovery.');
      } else {
        recoveryAuthorization.current = null;
        setNotice('Unlocked');
        onUnlocked?.();
      }
    } catch {
      if (currentView === viewGeneration.current) {
        setError('That secret did not unlock this device. Try again.');
        setUnlockSecret('');
        unlockSecretRef.current?.focus();
      }
    } finally {
      if (currentView === viewGeneration.current) setBusy(false);
    }
  };

  const changePassphrase = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const currentView = viewGeneration.current;
    setBusy(true);
    setError('');
    let secret: UnlockSecret;
    if (useRecoveryAuthorization && recoveryAuthorization.current !== null) {
      secret = { kind: 'recovery_code', code: recoveryAuthorization.current };
      recoveryAuthorization.current = null;
      setUseRecoveryAuthorization(false);
    } else if (authorizationKind === 'passphrase') {
      secret = { kind: 'passphrase', passphrase: authorization };
    } else {
      secret = { kind: 'recovery_code', code: authorization };
    }
    try {
      const result = await service.changePassphrase(secret, newPassphrase);
      if (currentView !== viewGeneration.current) return;
      if (!result.ok) {
        setError(
          result.error === 'locked'
            ? 'The device locked before the change was saved.'
            : 'That authorization did not match. Nothing changed.',
        );
        return;
      }
      closeChangeFlow(false);
      setNotice('Passphrase changed. Your records were not re-encrypted.');
      onUnlocked?.();
    } catch {
      if (currentView === viewGeneration.current) {
        setError('The passphrase could not be changed. Nothing was changed.');
      }
    } finally {
      if (currentView === viewGeneration.current) setBusy(false);
    }
  };

  const beginSettingsChange = () => {
    recoveryAuthorization.current = null;
    setUseRecoveryAuthorization(false);
    setAuthorizationKind('passphrase');
    setAuthorization('');
    setNewPassphrase('');
    setError('');
    setChangeOpen(true);
  };

  const confirmationInput = (index: number, position: number) => (
    <label class="lock-screen__character" key={position}>
      <span>Character at position {position}</span>
      <input
        aria-label={`Character at position ${position}`}
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={1}
        onInput={(event) => {
          const next = [...confirmation] as [string, string, string, string];
          next[index] = event.currentTarget.value;
          setConfirmation(next);
        }}
        required
        value={confirmation[index]}
      />
    </label>
  );

  return (
    <main class="lock-screen" data-testid="lock-screen">
      <div class="lock-screen__ornament" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div class="lock-screen__content" key={mode}>
        {mode === 'loading' ? (
          <Card class="lock-screen__card" aria-busy="true">
            <p role="status">Checking this device…</p>
          </Card>
        ) : null}

        {mode === 'setup' ? (
          <Card class="lock-screen__card" heading="Create your lock">
            <p class="lock-screen__intro">
              Choose a passphrase you can remember. Use at least 10 characters; a phrase of four or
              more words is easy to remember.
            </p>
            <form class="lock-screen__form" onSubmit={startSetup}>
              <label for="lock-setup-passphrase">Passphrase</label>
              <input
                aria-describedby="lock-setup-passphrase-hint"
                autoComplete="new-password"
                id="lock-setup-passphrase"
                onInput={(event) => setSetupPassphrase(event.currentTarget.value)}
                required
                type="password"
                value={setupPassphrase}
              />
              <p class="lock-screen__hint" id="lock-setup-passphrase-hint">
                Use at least 10 characters. Your passphrase never leaves this device and isn't
                stored.
              </p>
              {error ? (
                <p class="lock-screen__error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy || !isPassphraseLengthAllowed(setupPassphrase)} type="submit">
                Create passphrase
              </Button>
            </form>
          </Card>
        ) : null}

        {mode === 'confirm' && setupCode && confirmPositions ? (
          <RecoverySetupSheet busy={busy} onClose={() => service.lock('manual')}>
            <div class="lock-screen__recovery-sheet">
              <p class="lock-screen__intro">
                Keep this code somewhere private. It is shown once and can unlock this device.
              </p>
              <p class="lock-screen__code-label">Recovery code</p>
              <output
                class="lock-screen__code"
                data-testid="recovery-code"
                aria-label="Recovery code"
              >
                {setupCode}
              </output>
              <p class="lock-screen__warning">
                If the app locks before you confirm, this code is discarded. Leaving the app longer
                than your lock timeout ({timeoutCopy}) locks it and discards this code. Start setup
                again and replace any saved copy with the new code.
              </p>
              <form
                class="lock-screen__form"
                data-testid="recovery-confirm-form"
                onSubmit={confirmSetup}
              >
                <p id="lock-confirm-instructions">
                  Enter the characters at positions {confirmPositions.join(', ')} in the code.
                </p>
                <div class="lock-screen__characters" aria-describedby="lock-confirm-instructions">
                  {confirmPositions.map((position, index) => confirmationInput(index, position))}
                </div>
                {error ? (
                  <p class="lock-screen__error" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button
                  disabled={busy || confirmation.some((character) => character.length !== 1)}
                  type="submit"
                >
                  Confirm recovery code
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => service.lock('manual')}
                  type="button"
                  variant="secondary"
                >
                  Lock now
                </Button>
              </form>
            </div>
          </RecoverySetupSheet>
        ) : null}
        {mode === 'resume-setup' ? (
          <Card class="lock-screen__card" heading="Finish setting up your lock">
            <p class="lock-screen__intro">
              This setup has no confirmed recovery code. Start again to receive a new code before
              continuing.
            </p>
            <form class="lock-screen__form" onSubmit={restartSetup}>
              <label for="lock-resume-passphrase">Passphrase</label>
              <input
                aria-describedby="lock-resume-passphrase-hint"
                autoComplete="new-password"
                id="lock-resume-passphrase"
                onInput={(event) => setSetupPassphrase(event.currentTarget.value)}
                required
                type="password"
                value={setupPassphrase}
              />
              <p class="lock-screen__hint" id="lock-resume-passphrase-hint">
                Use at least 10 characters.
              </p>
              {error ? (
                <p class="lock-screen__error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy || !isPassphraseLengthAllowed(setupPassphrase)} type="submit">
                Start again
              </Button>
              <Button
                disabled={busy}
                onClick={() => service.cancelSetup()}
                type="button"
                variant="secondary"
              >
                Discard setup
              </Button>
            </form>
          </Card>
        ) : null}

        {mode === 'locked' ? (
          <Card class="lock-screen__card" heading="Unlock this device">
            <form class="lock-screen__form" onSubmit={unlock}>
              <label for="lock-unlock-method">Unlock method</label>
              <select
                id="lock-unlock-method"
                onChange={(event) => {
                  setUnlockKind(event.currentTarget.value as SecretKind);
                  setUnlockSecret('');
                  setError('');
                }}
                value={unlockKind}
              >
                <option value="passphrase">Passphrase</option>
                <option value="recovery_code">Recovery code</option>
              </select>
              <label for="lock-unlock-secret">
                {unlockKind === 'passphrase' ? 'Passphrase' : 'Recovery code'}
              </label>
              {unlockKind === 'passphrase' ? (
                <input
                  autoComplete="current-password"
                  id="lock-unlock-secret"
                  ref={unlockSecretRef}
                  onInput={(event) => setUnlockSecret(event.currentTarget.value)}
                  required
                  type="password"
                  value={unlockSecret}
                />
              ) : (
                <input
                  autoComplete="off"
                  id="lock-unlock-secret"
                  ref={unlockSecretRef}
                  onInput={(event) => setUnlockSecret(event.currentTarget.value)}
                  required
                  type="text"
                  value={unlockSecret}
                />
              )}
              {error ? (
                <p class="lock-screen__error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy || unlockSecret.length === 0} type="submit">
                Unlock
              </Button>
            </form>
          </Card>
        ) : null}

        {mode === 'unlocked' ? (
          <Card class="lock-screen__card" heading="Settings">
            <p class="lock-screen__intro">Manage your lock and passphrase settings.</p>
            <div class="lock-screen__actions">
              <Button onClick={beginSettingsChange} type="button" variant="secondary">
                Change passphrase
              </Button>
              <Button onClick={() => service.lock('manual')} type="button" variant="quiet">
                Lock now
              </Button>
            </div>
          </Card>
        ) : null}

        {notice ? (
          <p class="lock-screen__notice" role="status">
            {notice}
          </p>
        ) : null}
        <span class="lock-screen__state" data-testid="lock-state" hidden>
          {mode === 'unlocked' ? 'unlocked' : 'locked'}
        </span>
      </div>

      <Sheet
        open={changeOpen}
        title="Change passphrase"
        onOpenChange={closeChangeFlow}
        closeLabel="Close passphrase settings"
      >
        <form class="lock-screen__form lock-screen__change-form" onSubmit={changePassphrase}>
          <p class="lock-screen__intro">
            Confirm with a passphrase or recovery code configured on this device.
          </p>
          {useRecoveryAuthorization && recoveryAuthorization.current !== null ? (
            <label class="lock-screen__reuse">
              <input
                checked={useRecoveryAuthorization}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setUseRecoveryAuthorization(checked);
                  if (!checked) recoveryAuthorization.current = null;
                }}
                type="checkbox"
              />
              Use the recovery code from this unlock once
            </label>
          ) : null}
          {!useRecoveryAuthorization || recoveryAuthorization.current === null ? (
            <>
              <label for="lock-authorization-method">Authorization method</label>
              <select
                id="lock-authorization-method"
                onChange={(event) => {
                  setAuthorizationKind(event.currentTarget.value as SecretKind);
                  setAuthorization('');
                }}
                value={authorizationKind}
              >
                <option value="passphrase">Current passphrase</option>
                <option value="recovery_code">Recovery code</option>
              </select>
              <label for="lock-authorization-secret">
                {authorizationKind === 'passphrase' ? 'Current passphrase' : 'Recovery code'}
              </label>
              {authorizationKind === 'passphrase' ? (
                <input
                  autoComplete="current-password"
                  id="lock-authorization-secret"
                  onInput={(event) => setAuthorization(event.currentTarget.value)}
                  required
                  type="password"
                  value={authorization}
                />
              ) : (
                <input
                  autoComplete="off"
                  id="lock-authorization-secret"
                  onInput={(event) => setAuthorization(event.currentTarget.value)}
                  required
                  type="text"
                  value={authorization}
                />
              )}
            </>
          ) : (
            <p class="lock-screen__hint">
              The recovery code is kept in memory for this flow and one use only.
            </p>
          )}
          <label for="lock-new-passphrase">New passphrase</label>
          <input
            aria-describedby="lock-new-passphrase-hint"
            autoComplete="new-password"
            id="lock-new-passphrase"
            onInput={(event) => setNewPassphrase(event.currentTarget.value)}
            required
            type="password"
            value={newPassphrase}
          />
          <p class="lock-screen__hint" id="lock-new-passphrase-hint">
            Use at least 10 characters; a phrase of four or more words is easy to remember.
          </p>
          {error ? (
            <p class="lock-screen__error" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={busy || !isPassphraseLengthAllowed(newPassphrase)} type="submit">
            Save new passphrase
          </Button>
          <Button
            disabled={busy}
            onClick={() => closeChangeFlow(false)}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
        </form>
      </Sheet>
      <span class="lock-screen__setup-state" data-testid="setup-state" hidden>
        {setupState}
      </span>
    </main>
  );
}
