import { useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { CONTRACEPTION, DEFAULT_SETTINGS, type Contraception } from '../../data/types.ts';
import { compare, parse, todayLocal } from '../../lib/date.ts';
import { parsePairingCode } from '../../share/crypto.ts';
import { refreshPartner } from '../../share/sync.ts';
import { Badge, Button } from '../components.tsx';
import {
  AddSquareIcon,
  AlertIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CycleIcon,
  DropIcon,
  HeartIcon,
  LockIcon,
  Logo,
  RefreshIcon,
  ShareIosIcon,
  UsersIcon,
} from '../icons.tsx';
import { CONTRACEPTION_LABEL } from '../labels.ts';

function numberOrUndefined(text: string, min: number, max: number): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
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

function OwnerSetup({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
  const today = todayLocal();
  const [lastStart, setLastStart] = useState('');
  const [cycleLength, setCycleLength] = useState('');
  const [periodLength, setPeriodLength] = useState('');
  const [contraception, setContraception] = useState<Contraception>('none');
  const [error, setError] = useState('');

  async function submit(event: Event) {
    event.preventDefault();
    const start = lastStart === '' ? undefined : parse(lastStart);
    if (start === null || (start !== undefined && compare(start, today) > 0)) {
      setError('Pick a date that is today or earlier.');
      return;
    }
    const cycle = numberOrUndefined(cycleLength, 15, 90);
    const period = numberOrUndefined(periodLength, 1, 14);
    if (cycleLength !== '' && cycle === undefined) {
      setError('Cycle length should be between 15 and 90 days.');
      return;
    }
    if (periodLength !== '' && period === undefined) {
      setError('Period length should be between 1 and 14 days.');
      return;
    }
    if (start !== undefined) await storage.putDay({ date: start, flow: 'medium' });
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      role: 'owner',
      contraception,
      ...(cycle ? { cycleLength: cycle } : {}),
      ...(period ? { periodLength: period } : {}),
    });
    location.hash = '#/today';
    await onDone();
  }

  return (
    <form class="stack" onSubmit={(event) => void submit(event)}>
      <header class="setup-head">
        <Logo id="setup-logo" />
        <h1>A few questions</h1>
        <p class="muted">All optional. You can change them later in Settings.</p>
      </header>
      <section class="ui-card">
        <div class="ui-card__head">
          <Badge tone="period">
            <DropIcon />
          </Badge>
          <h2 class="ui-card__heading">Your last period</h2>
        </div>
        <div class="field">
          <label class="field__label" for="setup-last-start">
            When did your last period start?
          </label>
          <span class="select">
            <input
              id="setup-last-start"
              type="date"
              max={today}
              value={lastStart}
              aria-describedby="setup-last-start-hint"
              onInput={(e) => setLastStart(e.currentTarget.value)}
            />
            <CalendarIcon />
          </span>
          <p id="setup-last-start-hint" class="field__hint">
            Leave it empty if you don't remember.
          </p>
        </div>
      </section>
      <section class="ui-card">
        <div class="ui-card__head">
          <Badge>
            <CycleIcon />
          </Badge>
          <h2 class="ui-card__heading">Your usual cycle</h2>
        </div>
        <div class="stack">
          <label class="field">
            <span class="field__label">Usual cycle length (days)</span>
            <input
              inputMode="numeric"
              placeholder="e.g. 28"
              value={cycleLength}
              onInput={(e) => setCycleLength(e.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span class="field__label">Usual period length (days)</span>
            <input
              inputMode="numeric"
              placeholder="e.g. 5"
              value={periodLength}
              onInput={(e) => setPeriodLength(e.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span class="field__label">Birth control</span>
            <span class="select">
              <select
                value={contraception}
                onChange={(e) => setContraception(e.currentTarget.value as Contraception)}
              >
                {CONTRACEPTION.map((method) => (
                  <option key={method} value={method}>
                    {CONTRACEPTION_LABEL[method]}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </span>
          </label>
        </div>
      </section>
      <ErrorNote text={error} />
      <div class="row">
        <Button variant="quiet" onClick={onBack}>
          <ChevronLeftIcon />
          Back
        </Button>
        <Button type="submit">
          Start
          <ChevronRightIcon />
        </Button>
      </div>
    </form>
  );
}

function PartnerSetup({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: Event) {
    event.preventDefault();
    const keys = parsePairingCode(code);
    if (keys === null) {
      setError('That code does not look right. Copy the whole code from her Share screen.');
      return;
    }
    setBusy(true);
    await storage.saveSettings({ ...DEFAULT_SETTINGS, role: 'partner' });
    await storage.saveShare({ role: 'partner', ...keys });
    try {
      await refreshPartner();
    } catch {
      // Offline or relay down: the partner screen offers a retry.
    }
    location.hash = '#/partner';
    await onDone();
  }

  return (
    <form class="stack" onSubmit={(event) => void submit(event)}>
      <header class="setup-head">
        <Logo id="connect-logo" />
        <h1>Connect to her</h1>
        <p class="muted">
          Ask her to open Share on her phone and send you the pairing code. You will only see what
          she chooses to share, and she can stop at any time.
        </p>
      </header>
      <section class="ui-card">
        <div class="ui-card__head">
          <Badge tone="sky">
            <LockIcon />
          </Badge>
          <h2 class="ui-card__heading">Her code</h2>
        </div>
        <div class="field">
          <label class="field__label" for="connect-code">
            Pairing code
          </label>
          <textarea
            id="connect-code"
            class="code-input"
            rows={3}
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            value={code}
            aria-describedby="connect-code-hint"
            onInput={(e) => setCode(e.currentTarget.value)}
          />
          <p id="connect-code-hint" class="field__hint">
            Paste the whole code. It starts with “flo1.”
          </p>
        </div>
      </section>
      <ErrorNote text={error} />
      <div class="row">
        <Button variant="quiet" disabled={busy} onClick={onBack}>
          <ChevronLeftIcon />
          Back
        </Button>
        <Button type="submit" disabled={busy} data-busy={busy ? 'true' : undefined}>
          {busy ? <RefreshIcon /> : <HeartIcon />}
          Connect
        </Button>
      </div>
      <p class="status-line" data-state="pending" role="status">
        {busy ? 'Connecting…' : ''}
      </p>
    </form>
  );
}

function installed(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function Welcome({ onPick }: { onPick: (role: 'owner' | 'partner') => void }) {
  return (
    <div class="stack">
      <header class="welcome">
        <Logo class="welcome__logo" id="welcome-logo" />
        <h1 class="welcome__title">Flo</h1>
        <p class="welcome__tagline">
          A private cycle tracker for the two of you. Everything stays on this phone unless you
          choose to share.
        </p>
      </header>
      {installed() ? null : (
        <section class="ui-card card--tone card--sky">
          <div class="ui-card__head">
            <Badge tone="sky">
              <AddSquareIcon />
            </Badge>
            <h2 class="ui-card__heading">First, add Flo to your Home Screen</h2>
          </div>
          <ol class="steps" role="list">
            <li class="steps__item">
              <span class="steps__num" aria-hidden="true">
                1
              </span>
              <span class="steps__text">
                In Safari, tap the Share{' '}
                <span class="nowrap">
                  button
                  <ShareIosIcon class="inline-icon" />
                </span>
              </span>
            </li>
            <li class="steps__item">
              <span class="steps__num" aria-hidden="true">
                2
              </span>
              <span class="steps__text">
                Choose <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li class="steps__item">
              <span class="steps__num" aria-hidden="true">
                3
              </span>
              <span class="steps__text">Open Flo from the new icon and set it up there.</span>
            </li>
          </ol>
          <p class="muted small">
            Data saved in a Safari tab stays separate from the Home Screen app, and Safari may clear
            it if you don't visit for a while.
          </p>
        </section>
      )}
      <section class="ui-card">
        <div class="ui-card__head">
          <Badge tone="period">
            <DropIcon />
          </Badge>
          <h2 class="ui-card__heading">I'm tracking my cycle</h2>
        </div>
        <p>Log your period, body, mood, desire and sex, and see your patterns.</p>
        <Button block onClick={() => onPick('owner')}>
          Set up my tracker
          <ChevronRightIcon />
        </Button>
      </section>
      <section class="ui-card">
        <div class="ui-card__head">
          <Badge tone="sky">
            <UsersIcon />
          </Badge>
          <h2 class="ui-card__heading">I'm her partner</h2>
        </div>
        <p>See what she shares with you, using the pairing code from her phone.</p>
        <Button variant="secondary" block onClick={() => onPick('partner')}>
          Connect to her
          <ChevronRightIcon />
        </Button>
      </section>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [role, setRole] = useState<'owner' | 'partner' | undefined>(undefined);
  return (
    <main class="screen screen--bare">
      {role === 'owner' ? (
        <OwnerSetup onDone={onDone} onBack={() => setRole(undefined)} />
      ) : role === 'partner' ? (
        <PartnerSetup onDone={onDone} onBack={() => setRole(undefined)} />
      ) : (
        <Welcome onPick={setRole} />
      )}
    </main>
  );
}
