import { useCallback, useEffect, useState } from 'preact/hooks';
import type { DayBundle } from '../../../contracts/entities.ts';
import { TRACKERS, type Tracker } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { format, parse, todayLocal } from '../../../lib/localdate/index.ts';
import { Button, Card, Chip } from '../../components/base';
import { TrackerEditor } from './tracker-editor.tsx';
import { formatDaySummary } from './day-summary.ts';
import {
  getPendingEdits,
  updatePendingTrackerDrafts,
  type PendingTrackerDrafts,
} from './pending-edits.ts';
import { DEFAULT_PINNED_TRACKERS, TRACKER_LABELS, type LogEntry, type LogRepo } from './types.ts';
import './log.css';

export interface LogScreenProps {
  readonly logRepo?: LogRepo | undefined;
  readonly localDate?: LocalDate | undefined;
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
  const [dateChangePending, setDateChangePending] = useState<LocalDate | null>(null);
  const [day, setDay] = useState<DayBundle | undefined>();
  const [loading, setLoading] = useState(Boolean(logRepo));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editorRevisions, setEditorRevisions] = useState<Partial<Record<Tracker, number>>>({});
  const [pendingDrafts, setPendingDrafts] = useState<PendingTrackerDrafts>({});
  const [localPinnedTrackers, setLocalPinnedTrackers] = useState<readonly Tracker[]>([
    ...DEFAULT_PINNED_TRACKERS,
  ]);
  const pinnedTrackers = pinnedTrackersProp ?? localPinnedTrackers;
  const updatePinnedTrackers = onPinnedTrackersChange ?? setLocalPinnedTrackers;
  const [selectedTracker, setSelectedTracker] = useState<Tracker | null>('desire');
  const [customizing, setCustomizing] = useState(false);
  const pending = getPendingEdits(pendingDrafts);
  const summary = formatDaySummary(day);

  const reportDraft = useCallback(
    (tracker: Tracker, entries: readonly LogEntry[], dirty: boolean) => {
      setPendingDrafts((current) => updatePendingTrackerDrafts(current, tracker, entries, dirty));
    },
    [],
  );

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

  const openDate = (date: LocalDate) => {
    setLoading(Boolean(logRepo));
    setDay(undefined);
    setSelectedDate(date);
    setDateText(format(date));
    setDateError(null);
    setDateChangePending(null);
    setSavedMessage('');
    setErrorMessage('');
    setPendingDrafts({});
  };

  const changeDate = (text: string) => {
    const parsed = parse(text);
    if (parsed === null) {
      setDateText(text);
      setDateError('Choose a valid calendar date.');
      return;
    }
    if (parsed === selectedDate) {
      setDateText(format(parsed));
      setDateError(null);
      setDateChangePending(null);
      return;
    }
    if (pending.dirtyTrackers.length > 0) {
      setDateText(format(selectedDate));
      setDateError(null);
      setDateChangePending(parsed);
      return;
    }
    openDate(parsed);
  };

  const saveEntries = async (entries: readonly LogEntry[]) => {
    if (!logRepo || dateError || saving || entries.length === 0) return;
    setSaving(true);
    setErrorMessage('');
    setSavedMessage('');
    try {
      await persistLogEntries(logRepo, selectedDate, entries);
      setDay(await logRepo.getDay(selectedDate));
      setSavedMessage('Saved privately.');
    } catch {
      setErrorMessage('That log could not be saved. It remains private; please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveDay = () => void saveEntries(getPendingEdits(pendingDrafts).entries);

  const clearTracker = async (tracker: Tracker) => {
    if (!logRepo || dateError || saving) return;
    setSaving(true);
    setErrorMessage('');
    setSavedMessage('');
    try {
      await logRepo.clearTracker(selectedDate, tracker);
      setDay(await logRepo.getDay(selectedDate));
      setPendingDrafts((current) => updatePendingTrackerDrafts(current, tracker, [], false));
      setEditorRevisions((current) => ({
        ...current,
        [tracker]: (current[tracker] ?? 0) + 1,
      }));
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

  const editorDisabled =
    !logRepo || loading || saving || dateError !== null || dateChangePending !== null;
  const canSaveDay =
    Boolean(logRepo) && !loading && !saving && dateError === null && pending.entries.length > 0;

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

      {dateChangePending ? (
        <div class="log-screen__date-confirmation" role="alert">
          <p>This day has unsaved edits. Discard them and open {format(dateChangePending)}?</p>
          <div class="log-screen__date-confirmation-actions">
            <Button variant="secondary" onClick={() => setDateChangePending(null)}>
              Stay on this day
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                const nextDate = dateChangePending;
                if (nextDate !== null) openDate(nextDate);
              }}
            >
              Discard edits and open date
            </Button>
          </div>
        </div>
      ) : null}

      {!logRepo ? (
        <p class="log-screen__locked" role="note">
          Unlock to save. These private log controls are paused until your encrypted space is ready.
        </p>
      ) : null}

      <Card class="log-screen__day-summary" heading="This day">
        {summary.length > 0 ? (
          <ul class="log-screen__summary-list">
            {summary.map((item) => (
              <li key={item.tracker}>
                <Button
                  class="log-screen__summary-entry"
                  variant="quiet"
                  onClick={() =>
                    setSelectedTracker(item.tracker === 'heavy_detail' ? 'flow' : item.tracker)
                  }
                >
                  <span class="log-screen__summary-label">{item.label}:</span> {item.value}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="log-screen__hint">Nothing logged yet</p>
        )}
      </Card>

      <div class="log-screen__day-actions">
        <Button disabled={!canSaveDay} onClick={saveDay}>
          Save day
        </Button>
      </div>

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
            {pinnedTrackers.map((tracker) => {
              const hasUnsavedEdits = pending.dirtyTrackers.includes(tracker);
              const descriptionId = `log-tracker-unsaved-${tracker}`;
              return (
                <span class="log-tracker-list__choice" key={tracker}>
                  <Chip
                    aria-describedby={hasUnsavedEdits ? descriptionId : undefined}
                    pressed={selectedTracker === tracker}
                    onPressedChange={() => setSelectedTracker(tracker)}
                  >
                    <span>{TRACKER_LABELS[tracker]}</span>
                    {hasUnsavedEdits ? (
                      <span class="log-tracker-list__unsaved-dot" aria-hidden="true" />
                    ) : null}
                  </Chip>
                  {hasUnsavedEdits ? (
                    <span class="log-screen__sr-only" id={descriptionId}>
                      Unsaved edits
                    </span>
                  ) : null}
                </span>
              );
            })}
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
      {!loading
        ? TRACKERS.map((tracker) => (
            <Card
              key={`${selectedDate}-${tracker}-${editorRevisions[tracker] ?? 0}`}
              hidden={selectedTracker !== tracker}
              aria-hidden={selectedTracker !== tracker ? 'true' : undefined}
              class="log-screen__form-card"
            >
              <TrackerEditor
                tracker={tracker}
                day={day}
                disabled={editorDisabled}
                onSave={(entries) => void saveEntries(entries)}
                onClear={() => void clearTracker(tracker)}
                onDraftChange={reportDraft}
              />
            </Card>
          ))
        : null}
    </section>
  );
}
