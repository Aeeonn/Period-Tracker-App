import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { DueReminder } from '../../../contracts/reminders.ts';
import type { EngineOutput } from '../../../contracts/engine-api.ts';
import type { ChanceCategory, Flow, Tracker, WarningSeverity } from '../../../contracts/enums.ts';
import type { LocalDate, LocalDateRange } from '../../../contracts/localdate.ts';
import { addDays, compare, diffDays, epochDay } from '../../../lib/localdate/index.ts';
import { Button, Card, Sheet, Toast } from '../../components/base';
import { RepositoriesContext } from '../../layout/repositories.tsx';
import { ReminderBanner } from '../../components/reminder-banner/index.tsx';
import { QuickLogSheet } from '../quicklog';
import {
  saveQuickLogEntry,
  undoQuickLogEntry,
  type QuickLogUndoReceipt,
} from '../quicklog/quick-log-model.ts';
import { DEFAULT_PINNED_TRACKERS, type LogRepo } from '../log/types.ts';
import {
  flowForBleedingAnswer,
  isPeriodStartedFlow,
  loggedTodayWithFlow,
  STILL_BLEEDING_ANSWERS,
} from './today-log-model.ts';
import './today.css';

export interface TodayContentSlot {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly sourceNote: string;
}

export interface TodayScreenProps {
  readonly engineOutput: EngineOutput;
  readonly today: LocalDate;
  readonly cycleDay: number | null;
  readonly stillBleeding: boolean;
  readonly flowToday?: Flow;
  readonly logRepo?: LogRepo | null | undefined;
  readonly contentSlot: TodayContentSlot;
  readonly loggedToday: readonly string[];
  readonly reminders?: readonly DueReminder[];
  readonly pinnedTrackers?: readonly Tracker[];
  readonly onOpenLog?: (() => void) | undefined;
}

type WhyTopic = 'prediction' | 'chance';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const CHANCE_LABELS: Record<ChanceCategory, string> = {
  HIGHER: 'Higher',
  MEDIUM: 'Medium',
  LOWER: 'Lower',
  PREGNANT_NOT_SHOWN: 'Not shown in pregnancy mode',
  POSSIBLE_BEFORE_FIRST_PERIOD: 'Possible before a first period',
  DEPENDS_ON_METHOD: 'Depends on method',
  UNKNOWN_TEST: 'Unknown',
  NOT_ESTIMATED_CYCLE_LENGTH: 'Not estimated',
  NO_DATA_YET: 'Not enough data yet',
};

const SEVERITY_LABELS: Record<WarningSeverity, string> = {
  EMERGENCY: 'Emergency',
  SEEK_ADVICE_SOON: 'Seek advice soon',
  DISCUSS: 'Discuss with a clinician',
  INFO: 'Information',
};

function formatLocalDate(value: LocalDate): string {
  const parts = value.split('-');
  if (parts.length !== 3) return value;

  const month = MONTH_LABELS[Number(parts[1]) - 1];
  const day = Number(parts[2]);
  return month && Number.isInteger(day) ? `${month} ${day}` : value;
}

function explanationText(engineOutput: EngineOutput): string | null {
  const explanation = engineOutput.explanations.find((item) => item.topic === 'prediction');
  const text = explanation?.values.text;
  return typeof text === 'string' ? text : null;
}

function explanationBasis(engineOutput: EngineOutput): string | null {
  const explanation = engineOutput.explanations.find((item) => item.topic === 'prediction');
  const basis = explanation?.values.basis;
  return typeof basis === 'string' ? basis : null;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type CycleRingSegment = 'period' | 'fertility' | 'today';

function dateInRange(value: LocalDate, range: LocalDateRange): boolean {
  return compare(value, range.start) >= 0 && compare(value, range.end) <= 0;
}

function weekdayIndex(value: LocalDate): number {
  return (((Number(epochDay(value)) + 4) % 7) + 7) % 7;
}

function weekDates(today: LocalDate): readonly LocalDate[] {
  const mondayOffset = (weekdayIndex(today) + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - mondayOffset));
}

function dateRangeLabel(range: LocalDateRange): string {
  return `${formatLocalDate(range.start)} through ${formatLocalDate(range.end)}`;
}

function cycleStartDate(
  engineOutput: EngineOutput,
  today: LocalDate,
  cycleDay: number | null,
): LocalDate | null {
  if (cycleDay !== null) return addDays(today, 1 - cycleDay);
  return engineOutput.cycles.at(-1)?.nextStart ?? null;
}

function ringArcPath(
  range: LocalDateRange,
  cycleStart: LocalDate | null,
  ringDays: number,
  radius: number,
): string | null {
  if (cycleStart === null) return null;
  const startDay = Math.max(0, diffDays(cycleStart, range.start));
  const endDay = Math.min(ringDays, diffDays(cycleStart, range.end) + 1);
  if (endDay <= startDay) return null;

  const startAngle = -90 + (startDay / ringDays) * 360;
  const endAngle = -90 + (endDay / ringDays) * 360;
  const startRadians = (startAngle * Math.PI) / 180;
  const endRadians = (endAngle * Math.PI) / 180;
  const startX = 120 + radius * Math.cos(startRadians);
  const startY = 120 + radius * Math.sin(startRadians);
  const endX = 120 + radius * Math.cos(endRadians);
  const endY = 120 + radius * Math.sin(endRadians);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

function CycleRing({
  cycleDay,
  engineOutput,
  stillBleeding,
  today,
}: {
  readonly engineOutput: EngineOutput;
  readonly today: LocalDate;
  readonly cycleDay: number | null;
  readonly stillBleeding: boolean;
}) {
  const [selectedSegment, setSelectedSegment] = useState<CycleRingSegment | null>(null);
  const prediction = engineOutput.prediction;
  const fertility = engineOutput.fertility;
  const predictionRange =
    prediction.kind === 'prediction' ? { start: prediction.lo, end: prediction.hi } : null;
  const fertilityRange = fertility.kind === 'fertility' ? fertility.possibleBand : null;
  const start = cycleStartDate(engineOutput, today, cycleDay);
  const todayOffset = start === null ? null : diffDays(start, today);
  const extentOffsets = [
    cycleDay ?? 0,
    todayOffset === null ? 0 : todayOffset + 1,
    start !== null && predictionRange !== null ? diffDays(start, predictionRange.end) + 1 : 0,
    start !== null && fertilityRange !== null ? diffDays(start, fertilityRange.end) + 1 : 0,
  ];
  const ringDays = Math.max(1, ...extentOffsets);
  const periodArc =
    predictionRange === null ? null : ringArcPath(predictionRange, start, ringDays, 86);
  const fertilityArc =
    fertilityRange === null ? null : ringArcPath(fertilityRange, start, ringDays, 66);
  const markerOffset =
    todayOffset === null ? null : Math.max(0, Math.min(ringDays - 1, todayOffset));
  const markerAngle = markerOffset === null ? -90 : -90 + ((markerOffset + 0.5) / ringDays) * 360;
  const markerRadians = (markerAngle * Math.PI) / 180;
  const markerPointX = 120 + 76 * Math.cos(markerRadians);
  const markerPointY = 120 + 76 * Math.sin(markerRadians);
  const untilPeriod = prediction.kind === 'prediction' ? diffDays(today, prediction.center) : null;
  const centerValue = stillBleeding
    ? cycleDay === null
      ? '-'
      : String(cycleDay)
    : untilPeriod !== null && untilPeriod >= 0
      ? String(untilPeriod)
      : cycleDay === null
        ? '-'
        : String(cycleDay);
  const centerLabel = stillBleeding
    ? 'period day'
    : untilPeriod !== null && untilPeriod >= 0
      ? untilPeriod === 1
        ? 'day until period'
        : 'days until period'
      : cycleDay === null
        ? 'cycle day unavailable'
        : 'day of cycle';
  const periodLabel =
    predictionRange === null
      ? null
      : `Predicted period window, ${dateRangeLabel(predictionRange)}.`;
  const fertilityLabel =
    fertilityRange === null ? null : `Possible fertile window, ${dateRangeLabel(fertilityRange)}.`;
  const fullDescription = [
    `Today is ${formatLocalDate(today)}.`,
    stillBleeding && cycleDay !== null ? `Period day ${cycleDay}.` : null,
    !stillBleeding && untilPeriod !== null && untilPeriod >= 0
      ? `${untilPeriod} ${untilPeriod === 1 ? 'day' : 'days'} until the predicted period.`
      : null,
    !stillBleeding && (untilPeriod === null || untilPeriod < 0) && cycleDay !== null
      ? `Day ${cycleDay} of the cycle.`
      : null,
    periodLabel,
    fertilityLabel,
    'The marker shows today. Each ring segment has a text label and explanation.',
  ]
    .filter(Boolean)
    .join(' ');
  const selectedExplanation =
    selectedSegment === 'period'
      ? 'This is the predicted period window. Dates can vary.'
      : selectedSegment === 'fertility'
        ? 'This is a possible fertile window. Ovulation can happen outside these dates.'
        : selectedSegment === 'today'
          ? `The marker shows today, ${formatLocalDate(today)}.`
          : 'Focus or choose a ring segment to learn what it means.';

  const dateLabels = weekDates(today);

  return (
    <div class="today-cycle-overview">
      <Card class="today-ring-card">
        <figure class="today-ring">
          <figcaption class="today-ring__caption">
            <h2>Cycle at a glance</h2>
            <p>Estimated timing, shown as a planning guide.</p>
          </figcaption>
          <div class="today-ring__visual">
            <svg
              class="today-ring__svg"
              viewBox="0 0 240 240"
              role="img"
              aria-label="Cycle ring"
              aria-describedby="today-ring-description"
            >
              <title>Cycle timing ring</title>
              <desc>{fullDescription}</desc>
              <circle
                class="today-ring__track today-ring__track--outer"
                cx="120"
                cy="120"
                r="86"
                aria-hidden="true"
              />
              <circle
                class="today-ring__track today-ring__track--inner"
                cx="120"
                cy="120"
                r="66"
                aria-hidden="true"
              />
              {fertilityArc ? (
                <path
                  class={`today-ring__segment today-ring__segment--fertility${selectedSegment === 'fertility' ? ' today-ring__segment--selected' : ''}`}
                  data-testid="today-ring-fertility-segment"
                  d={fertilityArc}
                  aria-hidden="true"
                  onClick={() => setSelectedSegment('fertility')}
                />
              ) : null}
              {periodArc ? (
                <path
                  class={`today-ring__segment today-ring__segment--period${selectedSegment === 'period' ? ' today-ring__segment--selected' : ''}`}
                  data-testid="today-ring-period-segment"
                  d={periodArc}
                  aria-hidden="true"
                  onClick={() => setSelectedSegment('period')}
                />
              ) : null}
              {markerOffset !== null ? (
                <g
                  class={`today-ring__marker${selectedSegment === 'today' ? ' today-ring__marker--selected' : ''}`}
                  data-testid="today-ring-today-segment"
                  aria-hidden="true"
                  onClick={() => setSelectedSegment('today')}
                >
                  <circle
                    class="today-ring__marker-hit-area"
                    cx={markerPointX}
                    cy={markerPointY}
                    r="22"
                  />
                  <line
                    x1={120 + 58 * Math.cos(markerRadians)}
                    y1={120 + 58 * Math.sin(markerRadians)}
                    x2={120 + 92 * Math.cos(markerRadians)}
                    y2={120 + 92 * Math.sin(markerRadians)}
                  />
                  <circle
                    class="today-ring__marker-dot"
                    cx={markerPointX}
                    cy={markerPointY}
                    r="7"
                  />
                </g>
              ) : null}
            </svg>
            <div class="today-ring__center" aria-hidden="true">
              <strong>{centerValue}</strong>
              <span>{centerLabel}</span>
            </div>
          </div>
          <p id="today-ring-description" class="visually-hidden">
            {fullDescription}
          </p>
          <div class="today-ring__legend" role="group" aria-label="Cycle ring segments">
            {predictionRange ? (
              <Button
                class="today-ring__legend-button"
                data-testid="today-ring-period-control"
                aria-pressed={selectedSegment === 'period'}
                onFocus={() => setSelectedSegment('period')}
                onClick={() => setSelectedSegment('period')}
                variant="secondary"
              >
                <span class="today-ring__swatch today-ring__swatch--period" aria-hidden="true" />
                Predicted period
                <span class="visually-hidden">{dateRangeLabel(predictionRange)}</span>
              </Button>
            ) : null}
            {fertilityRange ? (
              <Button
                class="today-ring__legend-button"
                data-testid="today-ring-fertility-control"
                aria-pressed={selectedSegment === 'fertility'}
                onFocus={() => setSelectedSegment('fertility')}
                onClick={() => setSelectedSegment('fertility')}
                variant="secondary"
              >
                <span class="today-ring__swatch today-ring__swatch--fertility" aria-hidden="true" />
                Possible fertile window
                <span class="visually-hidden">{dateRangeLabel(fertilityRange)}</span>
              </Button>
            ) : null}
            {markerOffset !== null ? (
              <Button
                class="today-ring__legend-button"
                data-testid="today-ring-today-control"
                aria-pressed={selectedSegment === 'today'}
                onFocus={() => setSelectedSegment('today')}
                onClick={() => setSelectedSegment('today')}
                variant="secondary"
              >
                <span class="today-ring__swatch today-ring__swatch--today" aria-hidden="true" />
                Today
                <span class="visually-hidden">{formatLocalDate(today)}</span>
              </Button>
            ) : null}
            {periodLabel === null && fertilityLabel === null && markerOffset === null ? (
              <p>Cycle dates are not available yet.</p>
            ) : null}
          </div>
          <p class="today-ring__explanation" aria-live="polite" aria-atomic="true">
            {selectedExplanation}
          </p>
        </figure>
      </Card>
      <section class="today-week" aria-labelledby="today-week-title">
        <div class="today-week__heading">
          <h2 id="today-week-title">This week</h2>
          <span>Today is marked</span>
        </div>
        <ol class="today-week__days" aria-label="Week around today">
          {dateLabels.map((date, index) => {
            const dayIndex = weekdayIndex(date);
            const isToday = date === today;
            const previousDate = index === 0 ? null : dateLabels[index - 1];
            const monthLabel =
              previousDate === null ||
              previousDate === undefined ||
              previousDate.slice(5, 7) !== date.slice(5, 7)
                ? MONTH_LABELS[Number(date.slice(5, 7)) - 1]
                : null;
            const isPeriod = predictionRange !== null && dateInRange(date, predictionRange);
            const isFertile = fertilityRange !== null && dateInRange(date, fertilityRange);
            const ariaParts = [WEEKDAY_NAMES[dayIndex], formatLocalDate(date)];
            if (isToday) ariaParts.push('today');
            if (isPeriod) ariaParts.push('predicted period window');
            if (isFertile) ariaParts.push('possible fertile window');
            return (
              <li
                key={date}
                class={`today-week__day${isToday ? ' today-week__day--today' : ''}`}
                aria-label={ariaParts.join(', ')}
                aria-current={isToday ? 'date' : undefined}
              >
                <span class="today-week__weekday">{WEEKDAY_SHORT[dayIndex]}</span>
                {monthLabel ? <span class="today-week__month">{monthLabel}</span> : null}
                <strong>{Number(date.slice(8))}</strong>
                {isToday ? <span class="today-week__tag today-week__tag--today">Today</span> : null}
                {isPeriod ? (
                  <span class="today-week__tag today-week__tag--period">Period</span>
                ) : null}
                {isFertile ? (
                  <span class="today-week__tag today-week__tag--fertile">Fertile</span>
                ) : null}
                {!isToday && isPeriod && isFertile ? (
                  <span class="visually-hidden">Also within possible fertile window.</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

interface WarningNoticeProps {
  readonly warning: EngineOutput['warnings'][number];
  readonly onDismiss: () => void;
}

function WarningNotice({ onDismiss, warning }: WarningNoticeProps) {
  const severityClass = warning.severity.toLowerCase().replace(/_/gu, '-');
  const severityLabel = SEVERITY_LABELS[warning.severity];

  return (
    <Card
      class={`today-warning today-warning--${severityClass}`}
      data-testid={`today-warning-${warning.ruleId}`}
    >
      <div
        role={warning.severity === 'EMERGENCY' ? 'alert' : undefined}
        aria-live={warning.severity === 'EMERGENCY' ? 'assertive' : 'polite'}
      >
        <div class="today-warning__heading">
          <span class="today-warning__icon" aria-hidden="true">
            {warning.severity === 'INFO' ? 'i' : '!'}
          </span>
          <strong class="today-warning__severity">{severityLabel}</strong>
        </div>
        <p>A clinician guidance alert is active. Talk to a clinician.</p>
        <Button
          class="today-warning__dismiss"
          data-testid={`today-warning-dismiss-${warning.ruleId}`}
          disabled={!warning.dismissible}
          onClick={onDismiss}
          variant="quiet"
        >
          {warning.dismissible ? 'Dismiss guidance' : 'Cannot dismiss while active'}
        </Button>
      </div>
    </Card>
  );
}

export function TodayScreen({
  contentSlot,
  cycleDay,
  engineOutput,
  loggedToday,
  stillBleeding,
  flowToday,
  logRepo: logRepoOverride,
  today,
  reminders = [],
  pinnedTrackers = DEFAULT_PINNED_TRACKERS,
  onOpenLog,
}: TodayScreenProps) {
  const repositories = useContext(RepositoriesContext);
  const logRepo = logRepoOverride === undefined ? (repositories?.logRepo ?? null) : logRepoOverride;
  const [whyTopic, setWhyTopic] = useState<WhyTopic | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [currentCycleDay, setCurrentCycleDay] = useState<number | null>(cycleDay);
  const [flowOverride, setFlowOverride] = useState<{ readonly value: Flow | undefined } | null>(
    null,
  );
  const [undoReceipt, setUndoReceipt] = useState<QuickLogUndoReceipt | null>(null);
  const [localFlowUndo, setLocalFlowUndo] = useState<{
    readonly previous: Flow | undefined;
    readonly saved: Flow;
  } | null>(null);
  const [flowSaving, setFlowSaving] = useState(false);
  const [flowErrorMessage, setFlowErrorMessage] = useState('');
  const flowSaveLock = useRef(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<ReadonlySet<string>>(() => new Set());
  const [showStillBleeding, setShowStillBleeding] = useState(stillBleeding);
  const currentFlow = flowOverride === null ? flowToday : flowOverride.value;
  const visibleLoggedToday = loggedTodayWithFlow(
    loggedToday,
    currentFlow,
    flowOverride !== null || flowToday !== undefined,
  );

  useEffect(() => {
    setFlowOverride(null);
    setCurrentCycleDay(cycleDay);
    setShowStillBleeding(stillBleeding);
  }, [flowToday, loggedToday, cycleDay, stillBleeding]);

  const prediction = engineOutput.prediction;
  const noLoggedData = prediction.kind === 'suppressed' && prediction.reason === 'no_data';
  const predictionExplanation = explanationText(engineOutput);
  const predictionBasis = explanationBasis(engineOutput);
  const chanceCategory = engineOutput.chanceByDay[today] ?? 'NO_DATA_YET';
  const predictionText =
    prediction.kind === 'prediction'
      ? `Next period: around ${formatLocalDate(prediction.center)}`
      : (predictionExplanation ?? 'Predictions are paused for now.');
  const warnings = engineOutput.warnings.filter(
    (warning) => !dismissedWarnings.has(`${warning.ruleId}:${warning.scopeStart}`),
  );

  const saveFlow = async (value: Flow, label: string, periodStart = false) => {
    if (flowSaveLock.current) return;
    flowSaveLock.current = true;
    setFlowSaving(true);
    setFlowErrorMessage('');
    try {
      let previousFlow = currentFlow;
      if (logRepo) {
        const existingDay = await logRepo.getDay(today);
        previousFlow = existingDay?.flow;
        if (periodStart && previousFlow !== undefined && previousFlow !== 'none') {
          setFlowOverride({ value: previousFlow });
          return;
        }
        if (!periodStart && previousFlow === value) {
          setFlowOverride({ value });
          setShowStillBleeding(value !== 'none');
          return;
        }
        const receipt = await saveQuickLogEntry(logRepo, today, () => ({ tracker: 'flow', value }));
        setUndoReceipt(receipt);
        setLocalFlowUndo(null);
      } else {
        if (periodStart && previousFlow !== undefined && previousFlow !== 'none') return;
        if (!periodStart && previousFlow === value) {
          setShowStillBleeding(value !== 'none');
          return;
        }
        setLocalFlowUndo({ previous: previousFlow, saved: value });
        setUndoReceipt(null);
      }
      setFlowOverride({ value });
      if (periodStart) setCurrentCycleDay(1);
      setShowStillBleeding(value !== 'none');
      setToastMessage(`Saved: ${label}.`);
      setToastOpen(true);
      setLogOpen(false);
    } catch {
      setFlowErrorMessage('That entry could not be saved. Please try again.');
    } finally {
      flowSaveLock.current = false;
      setFlowSaving(false);
    }
  };

  const clearTodayFlow = async () => {
    if (currentFlow === undefined || flowSaveLock.current) return;
    flowSaveLock.current = true;
    setFlowSaving(true);
    setFlowErrorMessage('');
    try {
      if (logRepo) await logRepo.clearTracker(today, 'flow');
      setFlowOverride({ value: undefined });
      setUndoReceipt(null);
      setLocalFlowUndo(null);
      setToastOpen(false);
      setCurrentCycleDay(cycleDay);
      setShowStillBleeding(false);
    } catch {
      setFlowErrorMessage('That entry could not be removed. Please try again.');
    } finally {
      flowSaveLock.current = false;
      setFlowSaving(false);
    }
  };

  const undoLastFlowEntry = async () => {
    try {
      if (logRepo && undoReceipt) {
        const undone = await undoQuickLogEntry(logRepo, today, undoReceipt);
        if (!undone) {
          setFlowErrorMessage('This entry changed, so it could not be undone.');
          setToastOpen(false);
          return;
        }
        setFlowOverride({ value: undoReceipt.previousValue as Flow | undefined });
      } else if (localFlowUndo) {
        setFlowOverride({ value: localFlowUndo.previous });
      } else {
        return;
      }
      setCurrentCycleDay(cycleDay);
      setShowStillBleeding(stillBleeding);
      setUndoReceipt(null);
      setLocalFlowUndo(null);
      setToastOpen(false);
    } catch {
      setFlowErrorMessage('Undo could not be completed. Please try again.');
      setToastOpen(false);
    }
  };

  const dismissWarning = (warning: EngineOutput['warnings'][number]) => {
    if (!warning.dismissible) return;
    const warningKey = `${warning.ruleId}:${warning.scopeStart}`;
    setDismissedWarnings((current) => {
      const next = new Set(current);
      next.add(warningKey);
      return next;
    });
  };

  const answerStillBleeding = (answer: (typeof STILL_BLEEDING_ANSWERS)[number]) => {
    void saveFlow(flowForBleedingAnswer(answer), `Bleeding: ${answer}`);
  };

  const whyText =
    whyTopic === 'prediction'
      ? (predictionExplanation ??
        'This window is a planning estimate based on available cycle data.')
      : 'This category is an uncertain estimate. Pregnancy is possible any day.';

  return (
    <section class="today-screen" aria-labelledby="today-screen-title">
      <header class="today-screen__header">
        <p class="today-screen__eyebrow">Cycle overview</p>
        <h1 id="today-screen-title">Today</h1>
        <p class="today-screen__cycle-day">
          {currentCycleDay === null ? 'Cycle day unavailable' : `Cycle day ${currentCycleDay}`}
        </p>
      </header>

      {warnings.length > 0 ? (
        <section class="today-screen__warnings" aria-label="Clinician guidance">
          {warnings.map((warning) => (
            <WarningNotice
              key={`${warning.ruleId}:${warning.scopeStart}`}
              warning={warning}
              onDismiss={() => dismissWarning(warning)}
            />
          ))}
        </section>
      ) : null}

      <ReminderBanner reminders={reminders} />

      <CycleRing
        cycleDay={currentCycleDay}
        engineOutput={engineOutput}
        stillBleeding={showStillBleeding}
        today={today}
      />

      {noLoggedData ? (
        <Card class="today-empty-state" heading="No cycle logs yet">
          <p>
            Log your first period to start building your cycle view. Predictions will only appear
            when there is enough information.
          </p>
          <Button onClick={() => setLogOpen(true)}>Log first period</Button>
        </Card>
      ) : null}

      <div class="today-stat-grid" aria-label="Cycle details">
        <Card class="today-stat today-stat--period" heading="Next period">
          <p class="today-prediction__summary">{predictionText}</p>
          {prediction.kind === 'prediction' ? (
            <p class="today-prediction__range">
              Expected window: {formatLocalDate(prediction.lo)} &ndash;{' '}
              {formatLocalDate(prediction.hi)}
            </p>
          ) : null}
          {predictionBasis ? <p class="today-prediction__basis">{predictionBasis}</p> : null}
          <Button class="today-why" onClick={() => setWhyTopic('prediction')} variant="quiet">
            Why?
          </Button>
        </Card>

        <Card class="today-stat today-chance" heading="Fertile chance today">
          <p class="today-chance__value">{CHANCE_LABELS[chanceCategory]}</p>
          <p class="today-chance__uncertainty">
            This estimate is uncertain. Pregnancy is possible any day.
          </p>
          <p class="today-safety-line">No day is &quot;safe&quot; without contraception.</p>
          <Button class="today-why" onClick={() => setWhyTopic('chance')} variant="quiet">
            Why?
          </Button>
        </Card>

        <Card class="today-stat today-stat--cycle-day" heading="Cycle day">
          <p class="today-stat__value">
            {currentCycleDay === null ? 'Not available' : currentCycleDay}
          </p>
          <p class="today-stat__detail">
            {currentCycleDay === null
              ? 'Log a period to see your cycle day.'
              : showStillBleeding
                ? `Period day ${currentCycleDay}`
                : `Day ${currentCycleDay} of cycle`}
          </p>
        </Card>
      </div>

      <div class="today-actions" role="group" aria-label="Log today">
        <div class="today-actions__period">
          <Button
            class={
              isPeriodStartedFlow(currentFlow)
                ? 'today-flow-choice today-flow-choice--selected'
                : 'today-flow-choice'
            }
            aria-pressed={isPeriodStartedFlow(currentFlow)}
            disabled={flowSaving}
            onClick={() => void saveFlow('medium', 'Period started', true)}
          >
            {isPeriodStartedFlow(currentFlow) ? 'Period started ✓' : 'Period started'}
          </Button>
          {isPeriodStartedFlow(currentFlow) ? (
            <Button
              class="today-flow-remove"
              aria-label="Remove today's period entry"
              disabled={flowSaving}
              onClick={() => void clearTodayFlow()}
              variant="quiet"
            >
              ✕
            </Button>
          ) : null}
        </div>
        <Button onClick={() => setLogOpen(true)} variant="secondary">
          Log today
        </Button>
      </div>

      <p class="today-logged-summary">
        <strong>Logged today:</strong>{' '}
        {visibleLoggedToday.length > 0 ? visibleLoggedToday.join(' · ') : 'Nothing yet'}
      </p>
      {flowErrorMessage ? (
        <p class="today-flow-error" role="alert">
          {flowErrorMessage}
        </p>
      ) : null}

      {showStillBleeding || currentFlow !== undefined ? (
        <Card class="today-bleeding-prompt" heading="Still bleeding today?">
          <div class="today-bleeding-prompt__choices">
            {STILL_BLEEDING_ANSWERS.map((answer) => {
              const selected = currentFlow === flowForBleedingAnswer(answer);
              return (
                <div class="today-bleeding-prompt__choice" key={answer}>
                  <Button
                    class={
                      selected
                        ? 'today-flow-choice today-flow-choice--selected'
                        : 'today-flow-choice'
                    }
                    aria-pressed={selected}
                    disabled={flowSaving}
                    onClick={() => answerStillBleeding(answer)}
                    variant="secondary"
                  >
                    {answer}
                    {selected ? ' ✓' : ''}
                  </Button>
                  {selected ? (
                    <Button
                      class="today-flow-remove"
                      aria-label="Remove today's flow entry"
                      disabled={flowSaving}
                      onClick={() => void clearTodayFlow()}
                      variant="quiet"
                    >
                      ✕
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card class="today-content-slot" heading={contentSlot.title}>
        {contentSlot.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p class="today-content-slot__source">{contentSlot.sourceNote}</p>
      </Card>

      <Sheet
        open={whyTopic !== null}
        title="Why?"
        onOpenChange={(open) => {
          if (!open) setWhyTopic(null);
        }}
      >
        <div class="today-why-sheet">
          <p>{whyText}</p>
          {whyTopic === 'prediction' && predictionBasis ? <p>{predictionBasis}</p> : null}
        </div>
      </Sheet>

      <QuickLogSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        localDate={today}
        logRepo={logRepo}
        pinnedTrackers={pinnedTrackers}
        onOpenLog={onOpenLog}
      />

      <Toast
        actionLabel="Undo"
        durationMs={5000}
        onAction={() => void undoLastFlowEntry()}
        onDismiss={() => setToastOpen(false)}
        open={toastOpen}
      >
        {toastMessage}
      </Toast>
    </section>
  );
}
