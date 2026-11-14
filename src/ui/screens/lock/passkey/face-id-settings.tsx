import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import type { LockService, PasskeyInfo } from '../../../../contracts/lock.ts';
import type { PasskeyAuthenticator } from '../../../../lock/passkey/index.ts';
import { Button, Card } from '../../../components/base';
import './face-id.css';

type Status = 'loading' | 'unavailable' | 'off' | 'on';

export interface FaceIdSettingsCardProps {
  readonly service: LockService;
  readonly passkeys: PasskeyAuthenticator;
}

export function FaceIdSettingsCard({ service, passkeys }: FaceIdSettingsCardProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [info, setInfo] = useState<PasskeyInfo | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([passkeys.isAvailable(), service.passkeyInfo()])
      .then(([available, stored]) => {
        if (!mounted.current) return;
        setInfo(stored);
        setStatus(stored ? 'on' : available ? 'off' : 'unavailable');
      })
      .catch(() => {
        if (mounted.current) setStatus('unavailable');
      });
    return () => {
      mounted.current = false;
    };
  }, [service, passkeys]);

  const closeForm = () => {
    setFormOpen(false);
    setPassphrase('');
    setError('');
  };

  const turnOn = async (event: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const authorization = { kind: 'passphrase', passphrase } as const;
    try {
      const enrolled = await passkeys.enroll();
      if (!enrolled.ok) {
        if (!mounted.current) return;
        setError(
          enrolled.error === 'cancelled'
            ? 'Face ID was cancelled or timed out. Nothing changed.'
            : enrolled.error === 'unsupported'
              ? 'This device could not create a Face ID key that Flo can use. Nothing changed.'
              : 'Face ID could not be set up. Nothing changed.',
        );
        return;
      }
      const enrollment = enrolled.value;
      let result: Awaited<ReturnType<LockService['enablePasskey']>>;
      try {
        result = await service.enablePasskey(authorization, enrollment);
      } catch (error) {
        void passkeys.forget(enrollment.credentialId);
        throw error;
      } finally {
        enrollment.prfOutput.fill(0);
      }
      if (!result.ok) {
        void passkeys.forget(enrollment.credentialId);
        if (!mounted.current) return;
        setError(
          result.error === 'wrong_secret'
            ? 'That passphrase did not match. Face ID was not turned on.'
            : result.error === 'locked'
              ? 'The app locked before Face ID was turned on.'
              : 'Face ID did not return a usable key on this device. Nothing changed.',
        );
        return;
      }
      if (info && info.credentialId !== enrollment.credentialId) {
        void passkeys.forget(info.credentialId);
      }
      if (!mounted.current) return;
      setInfo({ credentialId: enrollment.credentialId, prfSalt: enrollment.prfSalt });
      setStatus('on');
      closeForm();
      setMessage('Face ID unlock is on for this device.');
    } catch {
      if (mounted.current) setError('Face ID could not be turned on. Nothing changed.');
    } finally {
      if (mounted.current) {
        setPassphrase('');
        setBusy(false);
      }
    }
  };

  const turnOff = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const previous = await service.passkeyInfo();
      const result = await service.disablePasskey();
      if (!result.ok) {
        if (mounted.current) setError('The app locked before Face ID was turned off.');
        return;
      }
      if (previous) void passkeys.forget(previous.credentialId);
      if (!mounted.current) return;
      setInfo(undefined);
      setStatus((await passkeys.isAvailable()) ? 'off' : 'unavailable');
      setMessage('Face ID unlock is off. Use your passphrase to unlock.');
    } catch {
      if (mounted.current) setError('Face ID could not be turned off. Nothing changed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Card class="settings-card face-id-card" heading="Face ID unlock">
      {status === 'loading' ? <p role="status">Checking Face ID on this device...</p> : null}
      {status === 'unavailable' ? (
        <p class="settings-screen__help">
          Face ID unlock is not available here. It needs Flo opened from the Home Screen on an
          iPhone with Face ID or Touch ID turned on.
        </p>
      ) : null}
      {status === 'off' || status === 'on' ? (
        <>
          <p class="settings-screen__help">
            {status === 'on'
              ? 'Face ID unlock is on for this device. Your passphrase and recovery code still work.'
              : 'Unlock with Face ID instead of typing your passphrase. Your passphrase and recovery code still work.'}
          </p>
          <p class="settings-screen__help">
            Face ID unlock works on this device only. If Face ID does not recognise you, your iPhone
            may ask for its passcode instead, so anyone who knows this iPhone's passcode could open
            Flo.
          </p>
        </>
      ) : null}

      {status === 'off' && !formOpen ? (
        <Button disabled={busy} onClick={() => setFormOpen(true)} type="button">
          Turn on Face ID
        </Button>
      ) : null}

      {status === 'off' && formOpen ? (
        <form class="face-id-card__form" onSubmit={turnOn}>
          <label class="settings-select-label" for="face-id-passphrase">
            Your passphrase
          </label>
          <input
            aria-describedby="face-id-passphrase-hint"
            autoComplete="current-password"
            id="face-id-passphrase"
            onInput={(event) => setPassphrase(event.currentTarget.value)}
            required
            type="password"
            value={passphrase}
          />
          <p class="settings-screen__help" id="face-id-passphrase-hint">
            Confirm it's you, then follow the Face ID prompt.
          </p>
          <div class="face-id-card__actions">
            <Button disabled={busy || passphrase.length === 0} type="submit">
              Continue with Face ID
            </Button>
            <Button disabled={busy} onClick={closeForm} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {status === 'on' ? (
        <Button disabled={busy} onClick={() => void turnOff()} type="button" variant="secondary">
          Turn off Face ID
        </Button>
      ) : null}

      {busy ? <p role="status">Working with Face ID...</p> : null}
      {error ? (
        <p class="settings-screen__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p class="settings-screen__saved" role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
