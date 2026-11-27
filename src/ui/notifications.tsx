import { useEffect, useState } from 'preact/hooks';
import * as storage from '../data/storage.ts';
import {
  isIud,
  OWNER_REMINDERS,
  PARTNER_REMINDERS,
  type NotifyPrefs,
  type Reminder,
} from '../data/types.ts';
import {
  disableReminders,
  enableReminders,
  pushSupport,
  refreshReminders,
  sendTestReminder,
} from '../notify/device.ts';
import { minutesOf } from '../notify/schedule.ts';
import { useApp } from './app.tsx';
import { Button, Card, Choice, Toggle } from './components.tsx';
import { AddSquareIcon, AlertIcon, BellIcon, ShareIosIcon } from './icons.tsx';

const REMINDER_TEXT: Record<Reminder, { label: string; detail: string }> = {
  daily_log: { label: 'Daily check-in', detail: 'A nudge to log your day. Skipped once you have.' },
  period_soon: { label: 'Period coming up', detail: 'A few days before your predicted period.' },
  period_check: {
    label: 'Did it start?',
    detail: 'Two days after the predicted day, if no period is logged.',
  },
  period_end: {
    label: 'Is it over?',
    detail: 'When only the first day of a period has been logged.',
  },
  backup: { label: 'Backup', detail: 'Once a month, until you export a copy.' },
  iud: {
    label: 'IUD replacement',
    detail: '90 and 30 days before it is due. Set the insertion date under Your cycle.',
  },
  partner_period_soon: {
    label: 'Period coming up',
    detail: 'A few days before her predicted period, if she shares it.',
  },
  partner_period_started: {
    label: 'Period started',
    detail: 'When she logs the first day, if she chooses to tell you.',
  },
};

const DAYS = ['1', '2', '3', '4', '5'] as const;
const DAY_LABELS = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' } as Record<
  (typeof DAYS)[number],
  string
>;

type Note = { readonly kind: 'ok' | 'error'; readonly text: string } | undefined;

export function Notifications() {
  const { settings, today } = useApp();
  const owner = settings.role === 'owner';
  const [prefs, setPrefs] = useState<NotifyPrefs>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>();
  const support = pushSupport();

  useEffect(() => {
    void storage.getNotify().then(setPrefs);
  }, []);

  async function change(update: Partial<NotifyPrefs>) {
    setPrefs(await storage.updateNotify(update));
    await refreshReminders();
  }

  async function turnOn() {
    setBusy(true);
    setNote(undefined);
    const result = await enableReminders(today);
    setPrefs(await storage.getNotify());
    setBusy(false);
    if (result === 'denied')
      setNote({
        kind: 'error',
        text: 'Notifications are blocked. Allow them in iPhone Settings › Notifications › Flo, then try again.',
      });
    if (result === 'failed')
      setNote({ kind: 'error', text: 'Could not turn reminders on. Check your connection.' });
  }

  async function turnOff() {
    setBusy(true);
    await disableReminders();
    setPrefs(await storage.getNotify());
    setBusy(false);
    setNote({ kind: 'ok', text: 'Reminders are off.' });
  }

  async function test() {
    setBusy(true);
    const result = await sendTestReminder();
    setBusy(false);
    if (result === 'gone') setPrefs(await storage.getNotify());
    setNote(
      result === 'sent'
        ? { kind: 'ok', text: 'Sent. It should arrive in a few seconds.' }
        : result === 'gone'
          ? { kind: 'error', text: 'This phone stopped accepting reminders. Turn them on again.' }
          : { kind: 'error', text: 'Could not send a test. Check your connection.' },
    );
  }

  const kinds = (owner ? OWNER_REMINDERS : PARTNER_REMINDERS).filter(
    (kind) => kind !== 'iud' || isIud(settings.contraception),
  );
  const soon: Reminder = owner ? 'period_soon' : 'partner_period_soon';

  let content;
  if (support === 'no_relay') {
    content = <p class="muted">Reminders are not available in this version of the app.</p>;
  } else if (support === 'unsupported') {
    content = (
      <p class="muted">
        This browser can’t show reminders. On iPhone they need iOS 16.4 or later, with Flo opened
        from the Home Screen.
      </p>
    );
  } else if (support === 'not_installed') {
    content = (
      <>
        <p class="muted">
          Reminders only work in the Home Screen app. In Safari, tap <ShareIosIcon /> Share, then{' '}
          <AddSquareIcon /> Add to Home Screen, and open Flo from there.
        </p>
        <p class="callout">
          <AlertIcon />
          <span>Data in a Safari tab is kept apart from the Home Screen app.</span>
        </p>
      </>
    );
  } else if (prefs === undefined) {
    content = null;
  } else if (!prefs.enabled) {
    content = (
      <>
        <p class="muted">
          {owner
            ? 'Gentle nudges to log, a heads-up before your period, and a monthly backup reminder. You choose which.'
            : 'A heads-up a few days before her period, from what she shares with you.'}
        </p>
        <p class="muted small">
          Reminders are written on this phone. The sharing server only learns when to wake each
          phone, and that timing could hint at the cycle.
        </p>
        <Button block disabled={busy} onClick={() => void turnOn()}>
          <BellIcon />
          Turn on reminders
        </Button>
      </>
    );
  } else {
    content = (
      <>
        <div class="stack stack--tight">
          {kinds.map((kind) => (
            <Toggle
              key={kind}
              label={REMINDER_TEXT[kind].label}
              detail={REMINDER_TEXT[kind].detail}
              checked={!prefs.off.includes(kind)}
              onChange={(on) =>
                void change({
                  off: on ? prefs.off.filter((k) => k !== kind) : [...prefs.off, kind],
                })
              }
            />
          ))}
        </div>
        <label class="field">
          <span class="field__label">Time of day</span>
          <input
            type="time"
            value={prefs.time}
            onChange={(event) => {
              const time = event.currentTarget.value;
              if (minutesOf(time) !== undefined) void change({ time });
            }}
          />
        </label>
        {prefs.off.includes(soon) ? null : (
          <Choice
            label="Days of notice before a period"
            options={DAYS}
            labels={DAY_LABELS}
            value={String(prefs.daysBefore) as (typeof DAYS)[number]}
            onChange={(value) => {
              if (value !== undefined) void change({ daysBefore: Number(value) });
            }}
          />
        )}
        <Toggle
          label="Discreet wording"
          detail="Shows only “Flo: You have a reminder” on the lock screen."
          checked={prefs.discreet}
          onChange={(discreet) => void change({ discreet })}
        />
        <div class="row">
          <Button variant="secondary" disabled={busy} onClick={() => void test()}>
            Send a test
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void turnOff()}>
            Turn off
          </Button>
        </div>
      </>
    );
  }

  return (
    <Card heading="Reminders" icon={<BellIcon />} tone="accent">
      {content}
      <p class="status-line" data-state={note?.kind === 'error' ? 'error' : 'sent'} role="status">
        {note?.text ?? ''}
      </p>
    </Card>
  );
}
