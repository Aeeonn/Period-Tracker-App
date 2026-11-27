import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { CONTRACEPTION, type Contraception, type Theme } from '../../data/types.ts';
import { scheduleUpload } from '../../share/sync.ts';
import { useApp } from '../app.tsx';
import { Badge, Button, Card, PageHeader, Segmented } from '../components.tsx';
import {
  AlertIcon,
  ChevronDownIcon,
  CycleIcon,
  DownloadIcon,
  Logo,
  MoonIcon,
  PhoneIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from '../icons.tsx';
import { CONTRACEPTION_LABEL } from '../labels.ts';
import { confirmDeleteEverything, download } from '../recovery.tsx';

type Note = { readonly kind: 'ok' | 'error'; readonly text: string } | undefined;

const THEMES: readonly { value: Theme; label: string; icon: ComponentChildren }[] = [
  { value: 'system', label: 'Match phone', icon: <PhoneIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

function Message({ note }: { note: Note }) {
  return (
    <p class="status-line" data-state={note?.kind === 'error' ? 'error' : 'sent'} role="status">
      {note?.text ?? ''}
    </p>
  );
}

function Lengths() {
  const { settings, saveSettings } = useApp();
  const [cycle, setCycle] = useState(settings.cycleLength?.toString() ?? '');
  const [period, setPeriod] = useState(settings.periodLength?.toString() ?? '');
  const [note, setNote] = useState<Note>();

  async function save(event: Event) {
    event.preventDefault();
    const c = cycle.trim() === '' ? undefined : Number(cycle);
    const p = period.trim() === '' ? undefined : Number(period);
    if (c !== undefined && (!Number.isInteger(c) || c < 15 || c > 90)) {
      setNote({ kind: 'error', text: 'Cycle length should be between 15 and 90 days.' });
      return;
    }
    if (p !== undefined && (!Number.isInteger(p) || p < 1 || p > 14)) {
      setNote({ kind: 'error', text: 'Period length should be between 1 and 14 days.' });
      return;
    }
    const { cycleLength: _c, periodLength: _p, ...rest } = settings;
    await saveSettings({
      ...rest,
      ...(c ? { cycleLength: c } : {}),
      ...(p ? { periodLength: p } : {}),
    });
    setNote({ kind: 'ok', text: 'Saved.' });
  }

  async function saveContraception(contraception: Contraception) {
    await saveSettings({ ...settings, contraception });
    setNote({ kind: 'ok', text: 'Saved.' });
  }

  return (
    <Card heading="Your cycle" icon={<CycleIcon />} tone="period">
      <form class="stack" onSubmit={(event) => void save(event)}>
        <p class="muted">Used until you have logged a few cycles. Leave blank if unsure.</p>
        <label class="field">
          <span class="field__label">Usual cycle length (days)</span>
          <input
            inputMode="numeric"
            value={cycle}
            onInput={(e) => setCycle(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field__label">Usual period length (days)</span>
          <input
            inputMode="numeric"
            value={period}
            onInput={(e) => setPeriod(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field__label">Birth control</span>
          <span class="select">
            <select
              value={settings.contraception}
              onChange={(e) => void saveContraception(e.currentTarget.value as Contraception)}
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
        <Message note={note} />
        <Button type="submit" variant="secondary" block>
          Save lengths
        </Button>
      </form>
    </Card>
  );
}

function Backup() {
  const { today, reload } = useApp();
  const [note, setNote] = useState<Note>();

  async function importFile(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setNote({ kind: 'error', text: 'That file could not be read.' });
      return;
    }
    const result = storage.readExport(parsed);
    if (typeof result === 'string') {
      setNote({ kind: 'error', text: result });
      return;
    }
    if (!confirm(`Replace everything on this phone with ${result.days.length} days from the file?`))
      return;
    await storage.importData(result);
    await reload();
    await scheduleUpload();
    setNote({ kind: 'ok', text: `Imported ${result.days.length} days.` });
  }

  return (
    <Card heading="Backup" icon={<DownloadIcon />} tone="mint">
      <p class="muted">
        Your data lives only on this phone. Export a file now and then and keep it somewhere safe.
      </p>
      <p class="callout">
        <AlertIcon />
        <span>The file is not encrypted.</span>
      </p>
      <div class="row">
        <Button
          variant="secondary"
          onClick={() =>
            void storage
              .exportData(today)
              .then((data) => download(`flo-${today}.json`, JSON.stringify(data, null, 2)))
          }
        >
          <DownloadIcon />
          Export
        </Button>
        <label class="ui-button ui-button--secondary">
          <UploadIcon />
          Import
          <input
            type="file"
            accept="application/json,.json"
            class="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void importFile(file);
            }}
          />
        </label>
      </div>
      <Message note={note} />
    </Card>
  );
}

export function SettingsScreen() {
  const { settings, saveSettings, reload } = useApp();
  const owner = settings.role === 'owner';

  async function deleteAll() {
    if (await confirmDeleteEverything()) await reload();
  }

  return (
    <div class="stack">
      <PageHeader eyebrow="Make it yours" title="Settings" />
      {owner ? <Lengths /> : null}
      <Card heading="Appearance" icon={<SunIcon />} tone="accent">
        <Segmented
          legend="Theme"
          options={THEMES}
          value={settings.theme}
          onChange={(theme) => void saveSettings({ ...settings, theme })}
        />
      </Card>
      {owner ? <Backup /> : null}
      <section class="ui-card card--danger">
        <div class="ui-card__head">
          <Badge tone="period">
            <TrashIcon />
          </Badge>
          <h2 class="ui-card__heading">Delete everything</h2>
        </div>
        <p class="muted">
          {owner
            ? 'Removes all your logs and settings from this phone, and your shared data from the sharing server.'
            : 'Removes the connection and everything she shared from this phone.'}
        </p>
        <Button variant="danger" block onClick={() => void deleteAll()}>
          <TrashIcon />
          Delete everything
        </Button>
      </section>
      <footer class="about">
        <Logo id="about-logo" />
        <div class="about__text">
          <p class="about__name">Flo</p>
          <p class="muted small">
            Flo is for information only. It is not medical advice and not birth control.
          </p>
        </div>
      </footer>
    </div>
  );
}
