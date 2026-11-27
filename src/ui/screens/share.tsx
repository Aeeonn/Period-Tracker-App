import type { ComponentChildren } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { SHARE_CATEGORIES, type OwnerShare, type ShareCategory } from '../../data/types.ts';
import { newShareKeys, pairingCode } from '../../share/crypto.ts';
import { createCouple, deleteCouple, RELAY_URL } from '../../share/relay-client.ts';
import { buildSnapshot } from '../../share/snapshot.ts';
import { scheduleUpload, uploadPending } from '../../share/sync.ts';
import { ShareArt } from '../art.tsx';
import { useApp } from '../app.tsx';
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  PageHeader,
  Toggle,
  type Tone,
} from '../components.tsx';
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  CopyIcon,
  DropIcon,
  EyeIcon,
  FlameIcon,
  HeartIcon,
  LeafIcon,
  LockIcon,
  NoteIcon,
  PauseIcon,
  PulseIcon,
  SlidersIcon,
  SmileIcon,
  SparkleIcon,
  UnlinkIcon,
} from '../icons.tsx';
import { CATEGORY_LABEL } from '../labels.ts';
import { PartnerView } from './partner-view.tsx';

interface Look {
  readonly icon: ComponentChildren;
  readonly tone: Tone;
}

const CATEGORY_LOOK: Record<ShareCategory, Look> = {
  period: { icon: <DropIcon />, tone: 'period' },
  fertility: { icon: <SparkleIcon />, tone: 'fertile' },
  body: { icon: <PulseIcon />, tone: 'peach' },
  mood: { icon: <SmileIcon />, tone: 'sun' },
  desire: { icon: <FlameIcon />, tone: 'fertile' },
  sex: { icon: <HeartIcon />, tone: 'accent' },
  habits: { icon: <LeafIcon />, tone: 'mint' },
};

const HOW_IT_WORKS: readonly (Look & { readonly text: string })[] = [
  {
    icon: <SlidersIcon />,
    tone: 'accent',
    text: 'You choose exactly what he sees, one category at a time. Everything starts off.',
  },
  {
    icon: <LockIcon />,
    tone: 'mint',
    text: 'It is encrypted on your phone. The sharing server only stores scrambled data it cannot read.',
  },
  { icon: <EyeIcon />, tone: 'sky', text: 'He can only look. He can never change your data.' },
  {
    icon: <PauseIcon />,
    tone: 'peach',
    text: 'Pause any time, or stop sharing to delete it from the server.',
  },
  { icon: <NoteIcon />, tone: 'sun', text: 'Your notes are never shared.' },
];

const PAIRING_STEPS = [
  'Copy the code.',
  'Send it to him privately.',
  'On his phone, he taps “Connect to her” and pastes it.',
];

function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function ErrorNote({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <p role="alert" class="error">
      <AlertIcon />
      <span>{text}</span>
    </p>
  );
}

export function ShareScreen() {
  const { share, saveShare, output, days, today } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const previewId = useId();

  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = setTimeout(() => setCopy('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  if (RELAY_URL === '') {
    return (
      <div class="stack">
        <PageHeader eyebrow="Together" title="Share" />
        <EmptyState art={<ShareArt />} title="Sharing is not set up">
          <p class="muted">This copy of the app was built without a sharing server.</p>
        </EmptyState>
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
        <PageHeader
          eyebrow="Together"
          title="Share with your partner"
          lede="Let him follow along, privately and on your terms."
        />
        <section class="ui-card share-intro">
          <ShareArt class="hero__art" />
          <h2 class="ui-card__heading">How it works</h2>
          <ul class="list" role="list">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.text} class="list__item">
                <Badge small tone={item.tone}>
                  {item.icon}
                </Badge>
                <span class="list__text">{item.text}</span>
              </li>
            ))}
          </ul>
          <ErrorNote text={error} />
          <Button block disabled={busy} onClick={() => void start()}>
            <HeartIcon />
            Start sharing
          </Button>
          <p class="status-line" data-state="pending" role="status">
            {busy ? 'Setting up…' : ''}
          </p>
        </section>
      </div>
    );
  }

  const owner: OwnerShare = share;
  const code = pairingCode(owner);
  const periodShared = owner.categories.includes('period') && !owner.paused;

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

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
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
  const shared = owner.categories.length;

  return (
    <div class="stack">
      <PageHeader
        eyebrow="Together"
        title="Share"
        aside={
          owner.paused ? (
            <span class="pill pill--peach">
              <PauseIcon />
              Paused
            </span>
          ) : (
            <span class="pill pill--mint pill--live">
              <span class="pill__dot" aria-hidden="true" />
              Sharing on
            </span>
          )
        }
      />

      <Card heading="Pairing code" icon={<LockIcon />} tone="accent">
        <ol class="steps" role="list">
          {PAIRING_STEPS.map((step, index) => (
            <li key={step} class="steps__item">
              <span class="steps__num" aria-hidden="true">
                {index + 1}
              </span>
              <span class="steps__text">{step}</span>
            </li>
          ))}
        </ol>
        <code class="code">{code}</code>
        <div class="code-actions">
          <Button
            variant="secondary"
            class={cx(copy === 'copied' && 'copied')}
            onClick={() => void copyCode()}
          >
            {copy === 'copied' ? <CheckIcon /> : <CopyIcon />}
            {copy === 'copied' ? 'Copied' : 'Copy code'}
          </Button>
        </div>
        <p class="visually-hidden" role="status">
          {copy === 'copied' ? 'Code copied.' : ''}
        </p>
        {copy === 'failed' ? (
          <p class="muted small">Could not copy. Press and hold the code to copy it.</p>
        ) : null}
      </Card>

      <section class={cx('ui-card', owner.paused && 'card--tone card--peach')}>
        <Toggle
          label="Pause sharing"
          detail="He sees that sharing is paused, and nothing else."
          icon={<PauseIcon />}
          tone="peach"
          checked={owner.paused}
          onChange={(paused) => void update({ paused })}
        />
      </section>

      <Card heading="What he can see" icon={<EyeIcon />} tone="sky">
        <p class="muted small">
          {shared === 0
            ? 'Everything starts off. Your notes are never shared.'
            : `${shared} of ${SHARE_CATEGORIES.length} shared. Your notes are never shared.`}
        </p>
        <div class="toggle-list">
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
              icon={CATEGORY_LOOK[category].icon}
              tone={CATEGORY_LOOK[category].tone}
              checked={owner.categories.includes(category)}
              disabled={owner.paused}
              onChange={(on) => toggleCategory(category, on)}
            />
          ))}
          <p
            class="status-line"
            data-state={owner.pendingUpload ? 'pending' : 'sent'}
            role="status"
          >
            {owner.pendingUpload
              ? 'Waiting to send changes…'
              : owner.lastUploadedAt
                ? `Sent ${ago(owner.lastUploadedAt)}.`
                : ''}
          </p>
        </div>
      </Card>

      <TellHim enabled={periodShared} />

      <Button
        variant="secondary"
        block
        aria-expanded={preview}
        aria-controls={preview ? previewId : undefined}
        onClick={() => setPreview(!preview)}
      >
        <EyeIcon />
        {preview ? 'Hide preview' : 'See what he sees'}
      </Button>
      {preview ? (
        <section id={previewId} class="phone" aria-label="Preview of his view">
          <div class="phone__screen">
            <span class="phone__notch" aria-hidden="true" />
            <p class="phone__caption">What he sees</p>
            <PartnerView snapshot={snapshot} today={today} />
          </div>
        </section>
      ) : null}

      <ErrorNote text={error} />
      <section class="ui-card card--danger">
        <div class="ui-card__head">
          <Badge tone="period">
            <UnlinkIcon />
          </Badge>
          <h2 class="ui-card__heading">Stop sharing</h2>
        </div>
        <p class="muted">
          Deletes your shared data from the server. You can start again later with a new code.
        </p>
        <Button variant="danger" block disabled={busy} onClick={() => void stop()}>
          <UnlinkIcon />
          Stop sharing
        </Button>
      </section>
    </div>
  );
}

/** Her choice to have his phone told when she logs the first day of a period. */
function TellHim({ enabled }: { enabled: boolean }) {
  const { output } = useApp();
  const [on, setOn] = useState<boolean>();

  useEffect(() => {
    void storage.getNotify().then((prefs) => setOn(prefs.tellPartner));
  }, []);

  async function change(next: boolean) {
    // Only periods that start from now on are announced, not one already under way.
    const prefs = await storage.updateNotify({
      tellPartner: next,
      ...(next && output.cycleStart ? { lastAnnouncedStart: output.cycleStart } : {}),
    });
    setOn(prefs.tellPartner);
  }

  if (on === undefined) return null;
  return (
    <section class="ui-card">
      <Toggle
        label="Tell him when my period starts"
        detail={
          enabled
            ? 'When you log the first day, his phone gets a notification saying only that it started. He needs reminders turned on.'
            : 'Share your period with him to use this.'
        }
        icon={<BellIcon />}
        tone="period"
        checked={on && enabled}
        disabled={!enabled}
        onChange={(next) => void change(next)}
      />
    </section>
  );
}
