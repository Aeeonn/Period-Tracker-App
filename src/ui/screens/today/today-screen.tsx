import { useState } from 'preact/hooks';
import type { EngineOutput } from '../../../contracts/engine-api.ts';
import type { ChanceCategory, WarningSeverity } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { Button, Card, Sheet, Toast } from '../../components/base';
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
  readonly contentSlot: TodayContentSlot;
  readonly loggedToday: readonly string[];
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
  today,
}: TodayScreenProps) {
  const [whyTopic, setWhyTopic] = useState<WhyTopic | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [visibleLoggedToday, setVisibleLoggedToday] = useState<readonly string[]>(loggedToday);
  const [currentCycleDay, setCurrentCycleDay] = useState<number | null>(cycleDay);
  const [lastAddedLog, setLastAddedLog] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<ReadonlySet<string>>(() => new Set());
  const [showStillBleeding, setShowStillBleeding] = useState(stillBleeding);
  const [bleedingAnswer, setBleedingAnswer] = useState<string | null>(null);

  const prediction = engineOutput.prediction;
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

  const saveLog = (entry: string) => {
    setVisibleLoggedToday((current) => [...current, entry]);
    setLastAddedLog(entry);
    setToastMessage(`Saved: ${entry}.`);
    setToastOpen(true);
    setLogOpen(false);
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

  const answerStillBleeding = (answer: string) => {
    setBleedingAnswer(answer);
    if (answer === 'Stopped') setShowStillBleeding(false);
    saveLog(`Bleeding: ${answer}`);
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

      <Card class="today-prediction" heading="Prediction window">
        <p class="today-prediction__summary">{predictionText}</p>
        {prediction.kind === 'prediction' ? (
          <p class="today-prediction__range">
            Expected window: {formatLocalDate(prediction.lo)} – {formatLocalDate(prediction.hi)}
          </p>
        ) : null}
        {predictionBasis ? <p class="today-prediction__basis">{predictionBasis}</p> : null}
        <Button class="today-why" onClick={() => setWhyTopic('prediction')} variant="quiet">
          Why?
        </Button>
      </Card>

      <Card class="today-chance" heading="Pregnancy chance today">
        <p class="today-chance__value">{CHANCE_LABELS[chanceCategory]}</p>
        <p class="today-safety-line">No day is &quot;safe&quot; without contraception.</p>
        <p class="today-chance__uncertainty">
          This estimate is uncertain. Pregnancy is possible any day.
        </p>
        <Button class="today-why" onClick={() => setWhyTopic('chance')} variant="quiet">
          Why?
        </Button>
      </Card>

      <div class="today-actions" role="group" aria-label="Log today">
        <Button
          onClick={() => {
            setCurrentCycleDay(1);
            setBleedingAnswer(null);
            setShowStillBleeding(true);
            saveLog('Period started');
          }}
        >
          Period started
        </Button>
        <Button onClick={() => setLogOpen(true)} variant="secondary">
          Log today
        </Button>
      </div>

      <p class="today-logged-summary">
        <strong>Logged today:</strong>{' '}
        {visibleLoggedToday.length > 0 ? visibleLoggedToday.join(' · ') : 'Nothing yet'}
      </p>

      {showStillBleeding ? (
        <Card class="today-bleeding-prompt" heading="Still bleeding today?">
          <div class="today-bleeding-prompt__choices">
            {['Yes, light', 'Yes, medium', 'Yes, heavy', 'Stopped'].map((answer) => (
              <Button key={answer} onClick={() => answerStillBleeding(answer)} variant="secondary">
                {answer}
              </Button>
            ))}
          </div>
          {bleedingAnswer ? <p role="status">Logged: {bleedingAnswer}</p> : null}
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

      <Sheet open={logOpen} title="Log today" onOpenChange={setLogOpen}>
        <div class="today-log-sheet">
          <fieldset class="today-log-group">
            <legend>Flow level</legend>
            <div class="today-log-group__choices">
              {['Light', 'Medium', 'Heavy'].map((flow) => (
                <Button key={flow} onClick={() => saveLog(`Flow: ${flow}`)} variant="secondary">
                  {flow}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset class="today-log-group">
            <legend>Symptoms</legend>
            <div class="today-log-group__choices">
              {['Cramps', 'Headache'].map((symptom) => (
                <Button
                  key={symptom}
                  onClick={() => saveLog(`Symptom: ${symptom}`)}
                  variant="secondary"
                >
                  {symptom}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset class="today-log-group">
            <legend>Mood</legend>
            <div class="today-log-group__choices">
              {['Okay', 'Low'].map((mood) => (
                <Button key={mood} onClick={() => saveLog(`Mood: ${mood}`)} variant="secondary">
                  {mood}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
      </Sheet>

      <Toast
        actionLabel="Undo"
        durationMs={5000}
        onAction={() => {
          if (lastAddedLog === null) return;
          if (lastAddedLog === 'Period started') {
            setCurrentCycleDay(cycleDay);
            setShowStillBleeding(stillBleeding);
            setBleedingAnswer(null);
          } else if (lastAddedLog.startsWith('Bleeding:')) {
            setShowStillBleeding(true);
            setBleedingAnswer(null);
          }
          setVisibleLoggedToday((current) => current.slice(0, -1));
          setLastAddedLog(null);
        }}
        onDismiss={() => setToastOpen(false)}
        open={toastOpen}
      >
        {toastMessage}
      </Toast>
    </section>
  );
}
