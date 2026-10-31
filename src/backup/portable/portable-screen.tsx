import { useState } from 'preact/hooks';
import type { ImportSummary } from '../../contracts/backup.ts';
import { TRACKERS, type Tracker } from '../../contracts/enums.ts';
import { Button, Card } from '../../ui/components/base';
import { useRepositories } from '../../ui/layout/repositories.tsx';
import { createPortableBackupService, type PortableExportFile } from './service.ts';
import './portable.css';

export interface PortableDataScreenProps {
  readonly onBack: () => void;
}

function downloadInMemory(file: PortableExportFile): void {
  const objectUrl = URL.createObjectURL(file.file);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function importError(error: 'invalid_file' | 'newer_schema' | 'wrong_secret'): string {
  if (error === 'newer_schema') {
    return 'This file was created by a newer app version. Update the app before trying again. Nothing was imported.';
  }
  if (error === 'wrong_secret') return 'This file could not be opened. Nothing was imported.';
  return 'This file is not a valid data export. Nothing was imported.';
}

export function PortableDataScreen({ onBack }: PortableDataScreenProps) {
  const repositories = useRepositories();
  const backupService = createPortableBackupService(repositories);
  const [tracker, setTracker] = useState<Tracker>('flow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingFile, setPendingFile] = useState<Blob | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const exportJson = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      downloadInMemory(await backupService.exportJson());
      setMessage('Your JSON export is ready to save.');
    } catch {
      setError('Your data could not be exported. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shareJson = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const exported = await backupService.exportJson();
      const file = new File([exported.file], exported.fileName, { type: exported.file.type });
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: 'Data export' });
        setMessage('Your data was shared using the device share sheet.');
      } else {
        downloadInMemory(exported);
        setMessage('Sharing is not available here, so your JSON export is ready to save.');
      }
    } catch {
      setError('Your data could not be shared. You can still download an export.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      downloadInMemory(await backupService.exportCsv(tracker));
      setMessage(`Your ${tracker} CSV export is ready to save.`);
    } catch {
      setError('Your CSV export could not be created. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const prepareImport = async (file: Blob): Promise<void> => {
    setBusy(true);
    setError('');
    setMessage('');
    setPendingFile(null);
    setSummary(null);
    try {
      const result = await backupService.importJson(file, { dryRun: true });
      if (!result.ok) {
        setError(importError(result.error));
        return;
      }
      setPendingFile(file);
      setSummary(result.summary);
      setMessage('Review this dry-run summary. No data has been changed.');
    } catch {
      setError('The import preview could not be prepared. Nothing was imported.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async (): Promise<void> => {
    if (pendingFile === null) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await backupService.importJson(pendingFile, { dryRun: false });
      if (!result.ok) {
        setPendingFile(null);
        setSummary(null);
        setError(importError(result.error));
        return;
      }
      setSummary(result.summary);
      setPendingFile(null);
      setMessage('Your data was imported. Newer records were merged by their change clocks.');
    } catch {
      setError('Your data could not be imported. No partial import was saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="portable-data shell-screen" aria-labelledby="portable-data-title">
      <p class="shell-eyebrow">A copy that stays with you</p>
      <h1 class="shell-screen__title" id="portable-data-title">
        Export / import my data
      </h1>
      <p class="portable-data__intro">
        Save a copy on this device or bring a data export back in. Files are prepared in memory and
        are not sent to a service.
      </p>

      {error ? <p class="portable-data__error" role="alert">{error}</p> : null}
      {message ? <p class="portable-data__message" role="status">{message}</p> : null}
      {busy ? <p role="status">Working with your file…</p> : null}

      <div class="portable-data__cards">
        <Card class="portable-data__card" heading="Export a copy">
          <p>Download your records as JSON, or make a CSV for one tracker at a time.</p>
          <div class="portable-data__actions">
            <Button variant="secondary" disabled={busy} onClick={() => void exportJson()}>
              Download JSON export
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => void shareJson()}>
              Share JSON export
            </Button>
          </div>
          <label class="portable-data__label" htmlFor="portable-tracker">
            Choose a tracker for CSV
          </label>
          <select
            id="portable-tracker"
            value={tracker}
            disabled={busy}
            onChange={(event) => setTracker(event.currentTarget.value as Tracker)}
          >
            {TRACKERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Button variant="secondary" disabled={busy} onClick={() => void exportCsv()}>
            Download tracker CSV
          </Button>
        </Card>

        <Card class="portable-data__card" heading="Import a copy">
          <p>Choose a JSON export to preview what would be merged before anything is written.</p>
          <label class="portable-data__label" htmlFor="portable-import-file">
            Choose a JSON data export
          </label>
          <input
            id="portable-import-file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void prepareImport(file);
            }}
          />
          {summary ? (
            <div class="portable-data__summary" aria-label="Import preview summary">
              <h3>Dry-run summary</h3>
              <p>Schema version {summary.schemaVersion}</p>
              <p>{summary.newer} newer, {summary.older} older, {summary.conflicts} conflicts</p>
              <ul>
                {Object.entries(summary.countsByEntity).map(([entity, count]) => (
                  <li key={entity}>{entity}: {count}</li>
                ))}
              </ul>
              {pendingFile ? (
                <Button disabled={busy} onClick={() => void confirmImport()}>
                  Import these records
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Button variant="quiet" disabled={busy} onClick={onBack}>
        Back to settings
      </Button>
    </section>
  );
}