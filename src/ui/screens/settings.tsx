import { useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { CONTRACEPTION, type Contraception, type Theme } from '../../data/types.ts';
import { scheduleUpload } from '../../share/sync.ts';
import { useApp } from '../app.tsx';
import { Button, Card } from '../components.tsx';
import { CONTRACEPTION_LABEL } from '../labels.ts';
import { confirmDeleteEverything, download } from '../recovery.tsx';

function Lengths() {
  const { settings, saveSettings } = useApp();
  const [cycle, setCycle] = useState(settings.cycleLength?.toString() ?? '');
  const [period, setPeriod] = useState(settings.periodLength?.toString() ?? '');
  const [message, setMessage] = useState('');

  async function save(event: Event) {
    event.preventDefault();
    const c = cycle.trim() === '' ? undefined : Number(cycle);
    const p = period.trim() === '' ? undefined : Number(period);
    if (c !== undefined && (!Number.isInteger(c) || c < 15 || c > 90)) {
      setMessage('Cycle length should be between 15 and 90 days.');
      return;
    }
    if (p !== undefined && (!Number.isInteger(p) || p < 1 || p > 14)) {
      setMessage('Period length should be between 1 and 14 days.');
      return;
    }
    const { cycleLength: _c, periodLength: _p, ...rest } = settings;
    await saveSettings({
      ...rest,
      ...(c ? { cycleLength: c } : {}),
      ...(p ? { periodLength: p } : {}),
    });
    setMessage('Saved.');
  }

  return (
    <Card heading="Your cycle">
      <form class="stack" onSubmit={(event) => void save(event)}>
        <p class="muted">Used until you have logged a few cycles. Leave blank if unsure.</p>
        <label class="field">
          <span>Usual cycle length (days)</span>
          <input
            inputMode="numeric"
            value={cycle}
            onInput={(e) => setCycle(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>Usual period length (days)</span>
          <input
            inputMode="numeric"
            value={period}
            onInput={(e) => setPeriod(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>Birth control</span>
          <select
            value={settings.contraception}
            onChange={(e) =>
              void saveSettings({
                ...settings,
                contraception: e.currentTarget.value as Contraception,
              })
            }
          >
            {CONTRACEPTION.map((method) => (
              <option key={method} value={method}>
                {CONTRACEPTION_LABEL[method]}
              </option>
            ))}
          </select>
        </label>
        {message ? <p role="status">{message}</p> : null}
        <Button type="submit" variant="secondary">
          Save lengths
        </Button>
      </form>
    </Card>
  );
}

function Backup() {
  const { today, reload } = useApp();
  const [message, setMessage] = useState('');

  async function importFile(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage('That file could not be read.');
      return;
    }
    const result = storage.readExport(parsed);
    if (typeof result === 'string') {
      setMessage(result);
      return;
    }
    if (!confirm(`Replace everything on this phone with ${result.days.length} days from the file?`))
      return;
    await storage.importData(result);
    await reload();
    await scheduleUpload();
    setMessage(`Imported ${result.days.length} days.`);
  }

  return (
    <Card heading="Backup">
      <p class="muted">
        Your data lives only on this phone. Export a file now and then and keep it somewhere safe.
        The file is not encrypted.
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
          Export
        </Button>
        <label class="ui-button ui-button--secondary">
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
      {message ? <p role="status">{message}</p> : null}
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
      <h1>Settings</h1>
      {owner ? <Lengths /> : null}
      <Card heading="Appearance">
        <label class="field">
          <span>Theme</span>
          <select
            value={settings.theme}
            onChange={(e) =>
              void saveSettings({ ...settings, theme: e.currentTarget.value as Theme })
            }
          >
            <option value="system">Match phone</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </Card>
      {owner ? <Backup /> : null}
      <Card heading="Delete everything">
        <p class="muted">
          {owner
            ? 'Removes all your logs and settings from this phone, and your shared data from the sharing server.'
            : 'Removes the connection and everything she shared from this phone.'}
        </p>
        <Button variant="danger" onClick={() => void deleteAll()}>
          Delete everything
        </Button>
      </Card>
      <p class="muted small">
        Flo is for information only. It is not medical advice and not birth control.
      </p>
    </div>
  );
}
