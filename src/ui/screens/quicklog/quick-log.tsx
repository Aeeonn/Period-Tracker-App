import { useContext, useEffect, useState } from 'preact/hooks';
import type { DayBundle, SexEvent } from '../../../contracts/entities.ts';
import {
  DESIRE,
  DISCHARGE,
  ENERGY,
  FLOW,
  MOOD,
  PREGNANCY_TEST_RESULT,
  SEX_ACTIVITY,
  STI_TEST_RESULT,
  SYMPTOMS_BODY,
  LH_TEST_RESULT,
  EMERGENCY_CONTRACEPTION,
  type Desire,
  type Discharge,
  type Energy,
  type Flow as FlowValue,
  type Mood as MoodValue,
  type SexActivity,
  type SymptomBody,
  type Tracker,
} from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { compare, parse } from '../../../lib/localdate/index.ts';
import { Button, Chip, Sheet, Toast } from '../../components/base';
import { RepositoriesContext } from '../../layout/repositories.tsx';
import {
  DEFAULT_PINNED_TRACKERS,
  optionLabel,
  TRACKER_LABELS,
  type LogEntry,
  type LogRepo,
} from '../log/types.ts';
import {
  saveQuickLogEntry,
  undoQuickLogEntry,
  type QuickLogUndoReceipt,
} from './quick-log-model.ts';
import './quick-log.css';

const ENERGY_LABELS: Readonly<Record<Energy, string>> = {
  0: 'Drained',
  1: 'Low',
  2: 'OK',
  3: 'Energised',
};

interface ChoiceGridProps<Value extends string | number> {
  readonly legend: string;
  readonly values: readonly Value[];
  readonly disabled: boolean;
  readonly selectedValue?: Value | undefined;
  readonly selectedValues?: readonly Value[] | undefined;
  readonly labelFor?: (value: Value) => string;
  readonly onChoose: (value: Value) => void;
}

function ChoiceGrid<Value extends string | number>({
  disabled,
  labelFor,
  legend,
  onChoose,
  selectedValue,
  selectedValues,
  values,
}: ChoiceGridProps<Value>) {
  return (
    <fieldset class="quick-log__group" disabled={disabled}>
      <legend>{legend}</legend>
      <div class="quick-log__choices">
        {values.map((value) => {
          const label =
            labelFor?.(value) ??
            (typeof value === 'string' ? optionLabel(value) : `Level ${value}`);
          return (
            <Chip
              key={String(value)}
              aria-label={label}
              pressed={selectedValue === value || selectedValues?.includes(value) === true}
              onPressedChange={() => onChoose(value)}
            >
              {label}
            </Chip>
          );
        })}
      </div>
    </fieldset>
  );
}

interface TestChoice {
  readonly label: string;
  readonly createEntry: (day: DayBundle | undefined) => LogEntry;
}

const TEST_CHOICES: readonly TestChoice[] = [
  ...PREGNANCY_TEST_RESULT.map((result) => ({
    label: `Pregnancy test: ${optionLabel(result)}`,
    createEntry: (day: DayBundle | undefined) => ({
      tracker: 'tests' as const,
      value: { ...(day?.tests ?? {}), pregnancy: result },
    }),
  })),
  ...LH_TEST_RESULT.map((result) => ({
    label: `LH test: ${optionLabel(result)}`,
    createEntry: (day: DayBundle | undefined) => ({
      tracker: 'tests' as const,
      value: { ...(day?.tests ?? {}), lh: result },
    }),
  })),
  ...STI_TEST_RESULT.map((result) => ({
    label: `STI test: ${optionLabel(result)}`,
    createEntry: (day: DayBundle | undefined) => ({
      tracker: 'tests' as const,
      value: { ...(day?.tests ?? {}), sti: { taken: true as const, result } },
    }),
  })),
  ...EMERGENCY_CONTRACEPTION.map((option) => ({
    label: `Emergency contraception: ${optionLabel(option)}`,
    createEntry: (day: DayBundle | undefined) => ({
      tracker: 'tests' as const,
      value: { ...(day?.tests ?? {}), emergency_contraception: option },
    }),
  })),
];

export interface QuickLogSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly localDate: LocalDate;
  readonly initialTracker?: Tracker | undefined;
  readonly pinnedTrackers?: readonly Tracker[];
  readonly onOpenLog?: (() => void) | undefined;
  readonly logRepo?: LogRepo | null | undefined;
}

export function QuickLogSheet({
  localDate,
  logRepo: logRepoOverride,
  initialTracker,
  onOpenChange,
  onOpenLog,
  open,
  pinnedTrackers = DEFAULT_PINNED_TRACKERS,
}: QuickLogSheetProps) {
  const repositories = useContext(RepositoriesContext);
  const logRepo = logRepoOverride === undefined ? (repositories?.logRepo ?? null) : logRepoOverride;
  const [todayLog, setTodayLog] = useState<DayBundle | undefined>();
  const [selectedLogDate, setSelectedLogDate] = useState<LocalDate>(localDate);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<QuickLogUndoReceipt | null>(null);
  const [undoLocalDate, setUndoLocalDate] = useState<LocalDate>(localDate);
  const [selectedTracker, setSelectedTracker] = useState<Tracker | null>(() =>
    initialTracker ??
    (pinnedTrackers.includes('symptoms_body') ? 'symptoms_body' : (pinnedTrackers[0] ?? null)),
  );
  useEffect(() => {
    if (!open) return;
    setSelectedLogDate(localDate);
    setSelectedTracker(
      initialTracker ??
        (pinnedTrackers.includes('symptoms_body') ? 'symptoms_body' : (pinnedTrackers[0] ?? null)),
    );
  }, [open, localDate, initialTracker, pinnedTrackers]);

  useEffect(() => {
    if (!open || !logRepo) {
      setTodayLog(undefined);
      setLoadingDay(false);
      return;
    }
    let mounted = true;
    setLoadingDay(true);
    void logRepo
      .getDay(selectedLogDate)
      .then((day) => {
        if (mounted) setTodayLog(day);
      })
      .catch(() => {
        if (mounted) setTodayLog(undefined);
      })
      .finally(() => {
        if (mounted) setLoadingDay(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, selectedLogDate, logRepo]);

  const activeTracker =
    selectedTracker !== null &&
    (pinnedTrackers.includes(selectedTracker) || selectedTracker === initialTracker)
      ? selectedTracker
      : pinnedTrackers.includes('symptoms_body')
        ? 'symptoms_body'
        : (pinnedTrackers[0] ?? null);

  const saveEntry = async (
    createEntry: (day: DayBundle | undefined) => LogEntry,
    label: string,
  ) => {
    if (!logRepo || saving) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const receipt = await saveQuickLogEntry(logRepo, selectedLogDate, createEntry);
      setUndoReceipt(receipt);
      setUndoLocalDate(selectedLogDate);
      setToastMessage(`Saved: ${label}.`);
      setToastOpen(true);
      setNoteDraft('');
      onOpenChange(false);
    } catch {
      setErrorMessage('That log could not be saved. It remains private; please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveSimple = <Value extends string>(
    tracker: 'flow' | 'desire' | 'discharge',
    value: Value,
    label: string,
  ) => saveEntry(() => ({ tracker, value }) as LogEntry, `${TRACKER_LABELS[tracker]}: ${label}`);

  const saveSymptom = (symptom: SymptomBody) =>
    saveEntry(
      (day) => {
        const previous = day?.symptoms_body ?? [];
        return {
          tracker: 'symptoms_body',
          value: previous.includes(symptom) ? previous : [...previous, symptom],
        };
      },
      `Symptom: ${optionLabel(symptom)}`,
    );

  const saveMood = (mood: MoodValue) =>
    saveEntry(
      (day) => {
        const previous = day?.mood ?? [];
        return { tracker: 'mood', value: previous.includes(mood) ? previous : [...previous, mood] };
      },
      `Mood: ${optionLabel(mood)}`,
    );

  const saveSexActivity = (activity: SexActivity) =>
    saveEntry(
      (day) => {
        const event: SexEvent = { activity: [activity], protection: [] };
        return { tracker: 'sex', value: [...(day?.sex ?? []), event] };
      },
      `Sex and intimacy: ${optionLabel(activity)}`,
    );

  const saveEnergy = (value: (typeof ENERGY)[number]) =>
    saveEntry(() => ({ tracker: 'energy', value }), `Energy: ${ENERGY_LABELS[value]}`);

  const saveTestChoice = (choice: TestChoice) => saveEntry(choice.createEntry, choice.label);

  const saveNote = () => {
    const value = noteDraft;
    return saveEntry(() => ({ tracker: 'notes', value }), 'Note');
  };

  const undoLastSave = async () => {
    if (!logRepo || !undoReceipt) return;
    try {
      const undone = await undoQuickLogEntry(logRepo, undoLocalDate, undoReceipt);
      if (!undone) {
        setErrorMessage('This tracker changed after the quick log, so nothing was undone.');
        onOpenChange(true);
      }
    } catch {
      setErrorMessage('Undo could not be completed. Please reopen your log and try again.');
      onOpenChange(true);
    }
    setUndoReceipt(null);
  };

  const renderTracker = (tracker: Tracker) => {
    switch (tracker) {
      case 'flow':
        return (
          <div class="quick-log__tracker" key={tracker}>
            {initialTracker === 'flow' ? (
              <label class="quick-log__date-field" for="quick-log-flow-date">
                <span>It started on</span>
                <input
                  id="quick-log-flow-date"
                  type="date"
                  max={localDate}
                  value={selectedLogDate}
                  disabled={saving}
                  onInput={(event) => {
                    const selected = parse(event.currentTarget.value);
                    if (selected === null || compare(selected, localDate) > 0) {
                      setErrorMessage('Choose today or a past date.');
                      return;
                    }
                    setSelectedLogDate(selected);
                    setErrorMessage('');
                  }}
                />
              </label>
            ) : null}
            <ChoiceGrid
              legend="Flow level"
              values={FLOW}
              disabled={!logRepo || saving || loadingDay}
              selectedValue={todayLog?.flow}
              onChoose={(value: FlowValue) => void saveSimple('flow', value, optionLabel(value))}
            />
          </div>
        );
      case 'symptoms_body':
        return (
          <ChoiceGrid
            key={tracker}
            legend="Symptoms"
            values={SYMPTOMS_BODY}
            disabled={!logRepo || saving || loadingDay}
            selectedValues={todayLog?.symptoms_body}
            onChoose={(value: SymptomBody) => void saveSymptom(value)}
          />
        );
      case 'mood':
        return (
          <ChoiceGrid
            key={tracker}
            legend="Mood"
            values={MOOD}
            disabled={!logRepo || saving || loadingDay}
            selectedValues={todayLog?.mood}
            onChoose={(value: MoodValue) => void saveMood(value)}
          />
        );
      case 'desire':
        return (
          <div class="quick-log__tracker" key={tracker}>
            <ChoiceGrid
              legend="Desire"
              values={DESIRE}
              disabled={!logRepo || saving || loadingDay}
              selectedValue={todayLog?.desire}
              onChoose={(value: Desire) => void saveSimple('desire', value, optionLabel(value))}
            />
            <p class="quick-log__helper">Just for you, to notice your own patterns.</p>
          </div>
        );
      case 'sex':
        return (
          <div class="quick-log__tracker" key={tracker}>
            <ChoiceGrid
              legend="Sex and intimacy"
              values={SEX_ACTIVITY}
              disabled={!logRepo || saving}
              onChoose={(value: SexActivity) => void saveSexActivity(value)}
            />
            <p class="quick-log__helper">
              Private. There's no way to share this in this version. Logging never implies consent.
            </p>
          </div>
        );
      case 'discharge':
        return (
          <ChoiceGrid
            key={tracker}
            legend="Discharge"
            values={DISCHARGE}
            disabled={!logRepo || saving || loadingDay}
            selectedValue={todayLog?.discharge}
            onChoose={(value: Discharge) => void saveSimple('discharge', value, optionLabel(value))}
          />
        );
      case 'energy':
        return (
          <ChoiceGrid
            key={tracker}
            legend="Energy"
            values={ENERGY}
            labelFor={(value) => ENERGY_LABELS[value]}
            disabled={!logRepo || saving || loadingDay}
            selectedValue={todayLog?.energy}
            onChoose={(value: (typeof ENERGY)[number]) => void saveEnergy(value)}
          />
        );
      case 'tests':
        return (
          <fieldset class="quick-log__group" disabled={!logRepo || saving} key={tracker}>
            <legend>Tests and emergency contraception</legend>
            <div class="quick-log__choices">
              {TEST_CHOICES.map((choice) => (
                <Chip
                  key={choice.label}
                  aria-label={choice.label}
                  pressed={false}
                  onPressedChange={() => void saveTestChoice(choice)}
                >
                  {choice.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        );
      case 'notes':
        return (
          <fieldset class="quick-log__group" disabled={!logRepo || saving} key={tracker}>
            <legend>Notes</legend>
            <label class="quick-log__note-field">
              <span>Note</span>
              <textarea
                value={noteDraft}
                onInput={(event) => setNoteDraft(event.currentTarget.value)}
              />
            </label>
            <Button
              disabled={!logRepo || saving || noteDraft.trim().length === 0}
              onClick={() => void saveNote()}
            >
              Save note
            </Button>
          </fieldset>
        );
      default:
        return (
          <section class="quick-log__group quick-log__unsupported" key={tracker}>
            <h3>{TRACKER_LABELS[tracker] ?? optionLabel(tracker)}</h3>
            <p>Open your full Log to add this tracker.</p>
            {onOpenLog ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                  onOpenLog();
                }}
              >
                Open Log
              </Button>
            ) : null}
          </section>
        );
    }
  };

  return (
    <>
      <Sheet open={open} title="Quick log" onOpenChange={onOpenChange}>
        <div class="quick-log">
          <p class="quick-log__privacy">
            Your logs are private. Logging never implies consent or enables sharing.
          </p>
          {logRepo === null || logRepo === undefined ? (
            <p class="quick-log__locked" role="note">
              Unlock to save. Your private log controls are paused until your encrypted space is
              ready.
            </p>
          ) : null}
          {errorMessage ? (
            <p class="quick-log__error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {pinnedTrackers.length > 0 ? (
            <div
              class="quick-log__tracker-pins"
              role="group"
              aria-label="Pinned quick-log trackers"
            >
              {(initialTracker && !pinnedTrackers.includes(initialTracker)
                ? [initialTracker, ...pinnedTrackers]
                : pinnedTrackers
              ).map((tracker) => (
                <Chip
                  key={tracker}
                  aria-label={TRACKER_LABELS[tracker]}
                  pressed={activeTracker === tracker}
                  onPressedChange={(pressed) => {
                    if (pressed) setSelectedTracker(tracker);
                  }}
                >
                  {TRACKER_LABELS[tracker]}
                </Chip>
              ))}
            </div>
          ) : (
            <p class="quick-log__locked">No trackers are pinned. Add trackers in Log.</p>
          )}
          {activeTracker ? (
            <div class="quick-log__groups">{renderTracker(activeTracker)}</div>
          ) : null}
        </div>
      </Sheet>
      {undoReceipt ? (
        <Toast
          actionLabel="Undo"
          durationMs={5000}
          onAction={() => void undoLastSave()}
          onDismiss={() => setToastOpen(false)}
          open={toastOpen}
        >
          {toastMessage}
        </Toast>
      ) : (
        <Toast open={toastOpen} onDismiss={() => setToastOpen(false)}>
          {toastMessage}
        </Toast>
      )}
    </>
  );
}
