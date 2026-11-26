import { useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { CONTRACEPTION, DEFAULT_SETTINGS, type Contraception } from '../../data/types.ts';
import { compare, parse, todayLocal } from '../../lib/date.ts';
import { parsePairingCode } from '../../share/crypto.ts';
import { refreshPartner } from '../../share/sync.ts';
import { Button, Card } from '../components.tsx';
import { CONTRACEPTION_LABEL } from '../labels.ts';

function numberOrUndefined(text: string, min: number, max: number): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
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
      <h1>A few questions</h1>
      <p class="muted">All optional. You can change them later in Settings.</p>
      <label class="field">
        <span>When did your last period start?</span>
        <input
          type="date"
          max={today}
          value={lastStart}
          onInput={(e) => setLastStart(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Usual cycle length (days)</span>
        <input
          inputMode="numeric"
          placeholder="e.g. 28"
          value={cycleLength}
          onInput={(e) => setCycleLength(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Usual period length (days)</span>
        <input
          inputMode="numeric"
          placeholder="e.g. 5"
          value={periodLength}
          onInput={(e) => setPeriodLength(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Birth control</span>
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
      </label>
      {error ? (
        <p role="alert" class="error">
          {error}
        </p>
      ) : null}
      <div class="row">
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Start</Button>
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
      <h1>Connect to her</h1>
      <p class="muted">
        Ask her to open Share on her phone and send you the pairing code. You will only see what she
        chooses to share, and she can stop at any time.
      </p>
      <label class="field">
        <span>Pairing code</span>
        <textarea
          rows={3}
          autoComplete="off"
          spellcheck={false}
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
      </label>
      {error ? (
        <p role="alert" class="error">
          {error}
        </p>
      ) : null}
      <div class="row">
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={busy}>
          Connect
        </Button>
      </div>
    </form>
  );
}

function installed(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [role, setRole] = useState<'owner' | 'partner' | undefined>(undefined);
  return (
    <main class="screen">
      {role === 'owner' ? (
        <OwnerSetup onDone={onDone} onBack={() => setRole(undefined)} />
      ) : role === 'partner' ? (
        <PartnerSetup onDone={onDone} onBack={() => setRole(undefined)} />
      ) : (
        <div class="stack">
          <h1>Flo</h1>
          <p class="muted">
            A private cycle tracker for the two of you. Everything stays on this phone unless you
            choose to share.
          </p>
          {installed() ? null : (
            <Card heading="First, add Flo to your Home Screen">
              <p>
                In Safari, tap the Share button, then <strong>Add to Home Screen</strong>. Open Flo
                from the new icon and set it up there. Data saved in a Safari tab stays separate
                from the Home Screen app, and Safari may clear it if you don't visit for a while.
              </p>
            </Card>
          )}
          <Card heading="I'm tracking my cycle">
            <p>Log your period, body, mood, desire and sex, and see your patterns.</p>
            <Button onClick={() => setRole('owner')}>Set up my tracker</Button>
          </Card>
          <Card heading="I'm her partner">
            <p>See what she shares with you, using the pairing code from her phone.</p>
            <Button variant="secondary" onClick={() => setRole('partner')}>
              Connect to her
            </Button>
          </Card>
        </div>
      )}
    </main>
  );
}
