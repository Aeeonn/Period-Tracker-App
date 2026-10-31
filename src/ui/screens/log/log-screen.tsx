import { useEffect, useState } from 'preact/hooks';
import type { DayBundle } from '../../../contracts/entities.ts';
import { TRACKERS, type Tracker } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { format, parse, todayLocal } from '../../../lib/localdate/index.ts';
import { Button, Card, Chip } from '../../components/base';
import { TrackerEditor } from './tracker-editor.tsx';
import { DEFAULT_PINNED_TRACKERS, TRACKER_LABELS, type LogEntry, type LogRepo } from './types.ts';
import './log.css';

export interface LogScreenProps {
  readonly logRepo?: LogRepo | undefined;
  readonly localDate?: LocalDate;
  readonly pinnedTrackers?: readonly Tracker[] | undefined;
  readonly onPinnedTrackersChange?: ((trackers: readonly Tracker[]) => void) | undefined;
}

export async function persistLogEntries(
  logRepo: LogRepo,
  localDate: LocalDate,
  entries: readonly LogEntry[],
): Promise<void> {
  for (const entry of entries) {
    switch (entry.tracker) {
      case 'flow':
        await logRepo.setTracker(localDate, 'flow', entry.value);
        break;
      case 'heavy_detail':
        await logRepo.setTracker(localDate, 'heavy_detail', entry.value);
        break;
      case 'period_pain':
        await logRepo.setTracker(localDate, 'period_pain', entry.value);
        break;
      case 'discharge':
        await logRepo.setTracker(localDate, 'discharge', entry.value);
        break;
      case 'symptoms_body':
        await logRepo.setTracker(localDate, 'symptoms_body', entry.value);
        break;
      case 'mood':
        await logRepo.setTracker(localDate, 'mood', entry.value);
        break;
      case 'energy':
        await logRepo.setTracker(localDate, 'energy', entry.value);
        break;
      case 'stress':
        await logRepo.setTracker(localDate, 'stress', entry.value);
        break;
      case 'desire':
        await logRepo.setTracker(localDate, 'desire', entry.value);
        break;
      case 'sex':
        await logRepo.setTracker(localDate, 'sex', entry.value);
        break;
      case 'tests':
        await logRepo.setTracker(localDate, 'tests', entry.value);
        break;
      case 'bbt':
        await logRepo.setTracker(localDate, 'bbt', entry.value);
        break;
      case 'ovulation_manual':
        await logRepo.setTracker(localDate, 'ovulation_manual', entry.value);
        break;
      case 'pill_intake':
        await logRepo.setTracker(localDate, 'pill_intake', entry.value);
        break;
      case 'medication':
        await logRepo.setTracker(localDate, 'medication', entry.value);
        break;
      case 'weight':
        await logRepo.setTracker(localDate, 'weight', entry.value);
        break;
      case 'water':
        await logRepo.setTracker(localDate, 'water', entry.value);
        break;
      case 'sleep':
        await logRepo.setTracker(localDate, 'sleep', entry.value);
        break;
      case 'activity':
        await logRepo.setTracker(localDate, 'activity', entry.value);
        break;
      case 'alcohol':
        await logRepo.setTracker(localDate, 'alcohol', entry.value);
        break;
      case 'notes':
        await logRepo.setTracker(localDate, 'notes', entry.value);
        break;
      case 'peri_impact':
        await logRepo.setTracker(localDate, 'peri_impact', entry.value);
        break;
      case 'lochia':
        await logRepo.setTracker(localDate, 'lochia', entry.value);
        break;
      default: {
        const unreachable: never = entry;
        throw new Error(`Unknown log tracker: ${String(unreachable)}`);
      }
    }
  }
}

export function LogScreen({
  logRepo,
  localDate: initialDate,
  pinnedTrackers: pinnedTrackersProp,
  onPinnedTrackersChange,
}: LogScreenProps) {
  const [selectedDate, setSelectedDate] = useState<LocalDate>(() => initialDate ?? todayLocal());
  const customizableTrackers: readonly Tracker[] = TRACKERS.filter(
    (tracker) => tracker !== 'heavy_detail',
  );
  const [dateText, setDateText] = useState(() => format(selectedDate));
  const [dateError, setDateError] = useState<string | null>(null);
  const [day, setDay] = useState<DayBundle | undefined>();
  const [loading, setLoading] = useState(Boolean(logRepo));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [localPinnedTrackers, setLocalPinnedTrackers] = useState<readonly Tracker[]>([
    ...DEFAULT_PINNED_TRACKERS,
  ]);
  const pinnedTrackers = pinnedTrackersProp ?? localPinnedTrackers;
  const updatePinnedTrackers = onPinnedTrackersChange ?? setLocalPinnedTrackers;
  const [selectedTracker, setSelectedTracker] = useState<Tracker | null>('desire');
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    let current = true;
    if (!logRepo) {
      setDay(undefined);
      setLoading(false);
      return () => {
        current = false;
      };
    }

    setLoading(true);
    setErrorMessage('');
    void logRepo
      .getDay(selectedDate)
      .then((record) => {
        if (current) setDay(record);
      })
      .catch(() => {
        if (current) setErrorMessage('Your log could not be opened. Please try again.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [logRepo, selectedDate]);

  const changeDate = (text: string) => {
    setDateText(text);
    const parsed = parse(text);
    if (parsed === null) {
      setDateError('Choose a valid calendar date.');
      return;
    }
    setSelectedDate(parsed);
    setDateError(null);
    setSavedMessage('');
  };

  const saveEntries = async (entries: readonly LogEntry[]) => {
    if (!logRepo || dateError || saving) return;
    setSaving(true);
    setErrorMessage('');
    setSavedMessage('');
    try {
      await persistLogEntries(logRepo, selectedDate, entries);
      setDay(await logRepo.getDay(selectedDate));
      setRevision((value) => value + 1);
      setSavedMessage('Saved privately.');
    } catch {
      setErrorMessage('That log could not be saved. It remains private; please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clearTracker = async (tracker: Tracker) => {
    if (!logRepo || dateError || saving) return;
    setSaving(true);
    setErrorMessage('');
    setSavedMessage('');
    try {
      await logRepo.clearTracker(selectedDate, tracker);
      setDay(await logRepo.getDay(selectedDate));
      setRevision((value) => value + 1);
      setSavedMessage('Log cleared.');
    } catch {
      setErrorMessage('That log could not be cleared. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const togglePinned = (tracker: Tracker) => {
    if (pinnedTrackers.includes(tracker)) {
      const next = pinnedTrackers.filter((item) => item !== tracker);
      updatePinnedTrackers(next);
      if (selectedTracker === tracker) setSelectedTracker(next[0] ?? null);
      return;
    }
    const next = [...pinnedTrackers, tracker];
    updatePinnedTrackers(next);
    if (selectedTracker === null) setSelectedTracker(tracker);
  };

  const moveTracker = (tracker: Tracker, offset: -1 | 1) => {
    const index = pinnedTrackers.indexOf(tracker);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= pinnedTrackers.length) return;
    const next = [...pinnedTrackers];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updatePinnedTrackers(next);
  };

  const editorDisabled = !logRepo || loading || saving || dateError !== null;

  return (
    <section class="log-screen" aria-labelledby="log-screen-title">
      <header class="log-screen__header">
        <p class="log-screen__eyebrow">A private space for your notes</p>
        <h1 id="log-screen-title">Log</h1>
        <p class="log-screen__privacy">
          Your logs stay private. A logged experience is never a signal of consent, never turns on
          sharing, and does not change fertility estimates.
        </p>
      </header>

      <Card class="log-screen__date-card" heading="Choose a day">
        <label class="log-input">
          <span>Log date</span>
          <input
            aria-describedby={dateError ? 'log-date-error' : undefined}
            type="date"
            value={dateText}
            onInput={(event) => changeDate(event.currentTarget.value)}
          />
        </label>
        {dateError ? (
          <p id="log-date-error" class="log-screen__error" role="alert">
            {dateError}
          </p>
        ) : null}
      </Card>

      {!logRepo ? (
        <p class="log-screen__locked" role="note">
          Unlock to save. These private log controls are paused until your encrypted space is ready.
        </p>
      ) : null}

      <section class="log-tracker-list" aria-labelledby="log-tracker-list-title">
        <div class="log-tracker-list__heading">
          <h2 id="log-tracker-list-title">Your trackers</h2>
          <Button
            variant="secondary"
            aria-expanded={customizing}
            aria-controls="log-tracker-customizer"
            onClick={() => setCustomizing(!customizing)}
          >
            {customizing ? 'Done' : 'Customize trackers'}
          </Button>
        </div>
        {pinnedTrackers.length > 0 ? (
          <div class="log-tracker-list__choices" role="group" aria-label="Pinned trackers">
            {pinnedTrackers.map((tracker) => (
              <Chip
                key={tracker}
                pressed={selectedTracker === tracker}
                onPressedChange={() => setSelectedTracker(tracker)}
              >
                {TRACKER_LABELS[tracker]}
              </Chip>
            ))}
          </div>
        ) : (
          <p class="log-screen__hint">No trackers are pinned. Customize your list to add one.</p>
        )}
      </section>

      {customizing ? (
        <Card
          id="log-tracker-customizer"
          class="log-tracker-customizer"
          heading="Pin, hide, or reorder"
        >
          <p class="log-screen__hint">
            Choose the trackers that feel useful to you, then arrange your pinned list.
          </p>
          <ul class="log-tracker-customizer__list">
            {customizableTrackers.map((tracker) => {
              const index = pinnedTrackers.indexOf(tracker);
              const isPinned = index >= 0;
              return (
                <li key={tracker}>
                  <span>{TRACKER_LABELS[tracker]}</span>
                  <div class="log-tracker-customizer__actions">
                    {isPinned ? (
                      <>
                        <Button
                          variant="quiet"
                          aria-label={`Move ${TRACKER_LABELS[tracker]} up`}
                          disabled={index === 0}
                          onClick={() => moveTracker(tracker, -1)}
                        >
                          Move up
                        </Button>
                        <Button
                          variant="quiet"
                          aria-label={`Move ${TRACKER_LABELS[tracker]} down`}
                          disabled={index === pinnedTrackers.length - 1}
                          onClick={() => moveTracker(tracker, 1)}
                        >
                          Move down
                        </Button>
                      </>
                    ) : null}
                    <Button variant="secondary" onClick={() => togglePinned(tracker)}>
                      {isPinned
                        ? `Hide ${TRACKER_LABELS[tracker]}`
                        : `Pin ${TRACKER_LABELS[tracker]}`}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {loading ? <p role="status">Opening your private log...</p> : null}
      {errorMessage ? (
        <p class="log-screen__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {savedMessage ? (
        <p class="log-screen__saved" role="status">
          {savedMessage}
        </p>
      ) : null}
      {selectedTracker ? (
        <Card class="log-screen__form-card">
          <TrackerEditor
            key={`${selectedTracker}-${revision}`}
            tracker={selectedTracker}
            day={day}
            disabled={editorDisabled}
            onSave={(entries) => void saveEntries(entries)}
            onClear={() => void clearTracker(selectedTracker)}
          />
        </Card>
      ) : null}
    </section>
  );
}
