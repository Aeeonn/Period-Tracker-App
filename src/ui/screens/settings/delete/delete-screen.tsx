import { useState } from 'preact/hooks';
import type { LocalWipeResult } from '../../../../data/wipe/index.ts';
import { Button } from '../../../components/base';
import './delete.css';

export interface DeleteAllScreenProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void | Promise<void>;
}

export function DeleteAllScreen({ onCancel, onConfirm }: DeleteAllScreenProps) {
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);

  const confirmDeletion = async () => {
    if (confirmation !== 'DELETE' || pending) return;
    setPending(true);
    await onConfirm();
  };

  return (
    <section class="delete-screen shell-screen" aria-labelledby="delete-screen-title">
      <p class="shell-eyebrow">You are in control</p>
      <h1 class="shell-screen__title" id="delete-screen-title">
        Delete all my data?
      </h1>
      <p>
        This removes data held by this app on this device. The app will try each cleanup step, even
        if another step fails.
      </p>
      <label class="delete-screen__label" for="delete-confirmation">
        Type DELETE to confirm.
      </label>
      <input
        id="delete-confirmation"
        class="delete-screen__input"
        type="text"
        value={confirmation}
        autoComplete="off"
        spellcheck={false}
        onInput={(event) => setConfirmation(event.currentTarget.value)}
      />
      <div class="delete-screen__actions">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          class="delete-screen__confirm"
          onClick={() => void confirmDeletion()}
          disabled={confirmation !== 'DELETE' || pending}
        >
          {pending ? 'Removing data...' : 'Delete everything'}
        </Button>
      </div>
    </section>
  );
}

export interface DeleteResultScreenProps {
  readonly result: LocalWipeResult;
  readonly onContinue: () => void;
}

export function DeleteResultScreen({ result, onContinue }: DeleteResultScreenProps) {
  return (
    <main class="delete-screen shell-screen" aria-labelledby="delete-result-title">
      <p class="shell-eyebrow">Local data cleanup</p>
      <h1 class="shell-screen__title" id="delete-result-title">
        {result.success ? 'Your local data was removed' : 'Some cleanup could not be confirmed'}
      </h1>
      {result.success ? (
        <p role="status">The app removed its local data from this device.</p>
      ) : (
        <div class="delete-screen__failure" role="alert">
          <p>
            We could not confirm that every local cleanup step finished. Other steps were still
            attempted.
          </p>
          <h2>Steps that could not be confirmed</h2>
          <ul>
            {result.failures.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
      <section class="delete-screen__limits" aria-labelledby="delete-limits-title">
        <h2 id="delete-limits-title">What this app cannot erase</h2>
        <ul>
          <li>Files you exported or saved somewhere else.</li>
          <li>Backups made by your device or operating system.</li>
          <li>Physical flash storage remnants; the app cannot promise physical erasure.</li>
        </ul>
        <p>This result covers data held by this app on this device.</p>
      </section>
      <Button onClick={onContinue}>Continue to fresh setup</Button>
    </main>
  );
}
