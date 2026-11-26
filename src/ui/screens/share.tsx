import { useState } from 'preact/hooks';
import { SHARE_CATEGORIES, type OwnerShare, type ShareCategory } from '../../data/types.ts';
import { newShareKeys, pairingCode } from '../../share/crypto.ts';
import { createCouple, deleteCouple, RELAY_URL } from '../../share/relay-client.ts';
import { buildSnapshot } from '../../share/snapshot.ts';
import { scheduleUpload, uploadPending } from '../../share/sync.ts';
import { useApp } from '../app.tsx';
import { Button, Card, Toggle } from '../components.tsx';
import { CATEGORY_LABEL } from '../labels.ts';
import { PartnerView } from './partner-view.tsx';

function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

export function ShareScreen() {
  const { share, saveShare, output, days, today } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  if (RELAY_URL === '') {
    return (
      <div class="stack">
        <h1>Share</h1>
        <Card heading="Sharing is not set up">
          <p>This copy of the app was built without a sharing server.</p>
        </Card>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError('');
    try {
      const keys = newShareKeys();
      await createCouple(keys);
      await saveShare({
        role: 'owner',
        ...keys,
        categories: [],
        paused: false,
        pendingUpload: true,
      });
      await uploadPending();
    } catch {
      setError('Could not reach the sharing server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (share?.role !== 'owner') {
    return (
      <div class="stack">
        <h1>Share with your partner</h1>
        <Card heading="How it works">
          <ul class="facts">
            <li>You choose exactly what he sees, one category at a time. Everything starts off.</li>
            <li>
              It is encrypted on your phone. The sharing server only stores scrambled data it cannot
              read.
            </li>
            <li>He can only look. He can never change your data.</li>
            <li>Pause any time, or stop sharing to delete it from the server.</li>
            <li>Your notes are never shared.</li>
          </ul>
          {error ? (
            <p role="alert" class="error">
              {error}
            </p>
          ) : null}
          <Button disabled={busy} onClick={() => void start()}>
            Start sharing
          </Button>
        </Card>
      </div>
    );
  }

  const owner: OwnerShare = share;
  const code = pairingCode(owner);

  async function update(change: Partial<Pick<OwnerShare, 'categories' | 'paused'>>) {
    await saveShare({ ...owner, ...change, pendingUpload: true });
    await scheduleUpload();
    // Pausing takes effect for him straight away rather than after the usual short delay.
    if (change.paused === true) void uploadPending();
  }

  function toggleCategory(category: ShareCategory, on: boolean) {
    const categories = SHARE_CATEGORIES.filter((item) =>
      item === category ? on : owner.categories.includes(item),
    );
    void update({ categories });
  }

  async function stop() {
    if (
      !confirm(
        'Stop sharing? This deletes your shared data from the server and he will see that sharing has ended.',
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCouple(owner);
      await saveShare(undefined);
    } catch {
      setError(
        'Could not reach the sharing server, so sharing has not stopped yet. Try again when online.',
      );
    } finally {
      setBusy(false);
    }
  }

  const snapshot = buildSnapshot({
    output,
    days,
    categories: owner.categories,
    paused: owner.paused,
    now: Date.now(),
  });

  return (
    <div class="stack">
      <h1>Share</h1>
      <Card heading="Pairing code">
        <p class="muted">Send this to him privately. He pastes it when he sets up the app.</p>
        <code class="code">{code}</code>
        <Button
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </Card>

      <Card heading="What he can see">
        <Toggle
          label="Pause sharing"
          detail="He sees that sharing is paused, and nothing else."
          checked={owner.paused}
          onChange={(paused) => void update({ paused })}
        />
        <hr />
        {SHARE_CATEGORIES.map((category) => (
          <Toggle
            key={category}
            label={CATEGORY_LABEL[category].title}
            detail={
              category === 'fertility' &&
              output.fertility.kind === 'none' &&
              output.fertility.reason === 'hormonal'
                ? 'Not shown: there is no estimate on your birth control.'
                : CATEGORY_LABEL[category].detail
            }
            checked={owner.categories.includes(category)}
            disabled={owner.paused}
            onChange={(on) => toggleCategory(category, on)}
          />
        ))}
        <p class="muted small" role="status">
          {owner.pendingUpload
            ? 'Waiting to send changes…'
            : owner.lastUploadedAt
              ? `Sent ${ago(owner.lastUploadedAt)}.`
              : ''}
        </p>
      </Card>

      <Button variant="secondary" onClick={() => setPreview(!preview)}>
        {preview ? 'Hide preview' : 'See what he sees'}
      </Button>
      {preview ? (
        <div class="preview" aria-label="Preview of his view">
          <PartnerView snapshot={snapshot} today={today} />
        </div>
      ) : null}

      {error ? (
        <p role="alert" class="error">
          {error}
        </p>
      ) : null}
      <Card heading="Stop sharing">
        <p class="muted">
          Deletes your shared data from the server. You can start again later with a new code.
        </p>
        <Button variant="danger" disabled={busy} onClick={() => void stop()}>
          Stop sharing
        </Button>
      </Card>
    </div>
  );
}
