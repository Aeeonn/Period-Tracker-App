import { useState } from 'preact/hooks';
import {
  cycleDay,
  isPeriodDay,
  PARAMS,
  type EngineOutput,
  type FertilityEstimate,
} from '../../engine/index.ts';
import { PHASE_LABEL, phaseOf, type Phase } from '../../engine/patterns.ts';
import { diffDays, shortLabel, weekday, type LocalDate } from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';
import { Badge, Button, Card, Info, PageHeader, type Tone } from '../components.tsx';
import { EMERGENCY_CARD, INFO_CARDS } from '../content.ts';
import { DayTags, describeDay } from '../describe.tsx';
import {
  CheckIcon,
  ChevronDownIcon,
  DropIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  SparkleIcon,
} from '../icons.tsx';
import { CycleRing, RingLegend, ringSpans } from '../ring.tsx';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PHASE_TONE: Record<Phase, Tone> = {
  period: 'period',
  after: 'mint',
  middle: 'fertile',
  before: 'peach',
};

let celebrateNext = false;

/** Show a small "saved" moment the next time Today opens. */
export function celebrateSave(): void {
  celebrateNext = true;
}

export function longDate(date: LocalDate): string {
  return `${WEEKDAY[weekday(date)]}, ${shortLabel(date)}`;
}

export function periodCaption(output: EngineOutput, today: LocalDate): string {
  const prediction = output.prediction;
  if (prediction.kind === 'none') return 'No prediction yet';
  if (prediction.state === 'late') {
    return `${prediction.daysLate ?? 0} ${prediction.daysLate === 1 ? 'day' : 'days'} late`;
  }
  if (prediction.state === 'expected_now') return 'Period could start any day';
  const days = diffDays(today, prediction.center);
  return `Period in about ${days} ${days === 1 ? 'day' : 'days'}`;
}

function Celebrate() {
  return (
    <div class="celebrate" role="status">
      <span class="confetti" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
      <span class="celebrate__icon" aria-hidden="true">
        <CheckIcon />
      </span>
      <span class="celebrate__text">
        <span class="celebrate__title">Saved for today</span>
        <span>Thanks for checking in.</span>
      </span>
    </div>
  );
}

function NextPeriod({ output, today }: { output: EngineOutput; today: LocalDate }) {
  const prediction = output.prediction;
  if (prediction.kind === 'none') {
    const needed = PARAMS.hormonal.minEpisodes;
    const logged = Math.min(needed, output.episodes.length);
    return (
      <Card heading="Next period" icon={<DropIcon />} tone="period">
        {prediction.reason === 'hormonal_few_periods' ? (
          <div class="dots-row">
            <span class="dots" aria-hidden="true">
              {Array.from({ length: needed }, (_, index) => (
                <span
                  key={index}
                  class={index < logged ? 'dots__dot dots__dot--on' : 'dots__dot'}
                />
              ))}
            </span>
            <span class="stat__sub">
              {logged} of {needed} periods logged
            </span>
          </div>
        ) : null}
        <p>{output.basis}</p>
      </Card>
    );
  }

  let big: string;
  let sub: string;
  if (prediction.state === 'late') {
    const late = prediction.daysLate ?? 0;
    big = `${late} ${late === 1 ? 'day' : 'days'} late`;
    sub = `Expected around ${shortLabel(prediction.center)}`;
  } else if (prediction.state === 'expected_now') {
    big = 'Any day now';
    sub = `Most likely around ${shortLabel(prediction.center)}`;
  } else {
    const days = diffDays(today, prediction.center);
    big = shortLabel(prediction.center);
    sub = `Most likely, in about ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return (
    <Card heading="Next period" icon={<DropIcon />} tone="period">
      <p class="stat">
        <span class="stat__big">{big}</span>
        <span class="stat__sub">{sub}</span>
      </p>
      <p>
        Likely between <strong>{shortLabel(prediction.lo)}</strong> and{' '}
        <strong>{shortLabel(prediction.hi)}</strong>.
      </p>
      <p class="muted small">
        This is a rule-of-thumb planning range, not a calibrated probability interval.{' '}
        {output.basis}
      </p>
    </Card>
  );
}

function Fertile({ fertility }: { fertility: FertilityEstimate }) {
  return (
    <Card heading="Fertile window (estimate)" icon={<SparkleIcon />} tone="fertile">
      <p class="stat">
        <span class="stat__sub">Around</span>
        <span class="stat__big">
          {shortLabel(fertility.window.start)} – {shortLabel(fertility.window.end)}
        </span>
      </p>
      {fertility.copperIud ? <p>Your method does not change ovulation.</p> : null}
      <p class="muted">
        Outside this window the chance is lower, not zero. Pregnancy is possible on any day you have
        sex without contraception.
      </p>
    </Card>
  );
}

export function Today() {
  const { today, output, days, settings } = useApp();
  const [celebrate] = useState(() => {
    const show = celebrateNext;
    celebrateNext = false;
    return show;
  });
  const day = cycleDay(output, today);
  const length =
    output.prediction.kind === 'prediction'
      ? output.prediction.cycleLength
      : (settings.cycleLength ?? 28);
  const logged = days.find((entry) => entry.date === today);
  const parts = logged ? describeDay(logged) : [];
  const fertility = output.fertility;
  const spans = ringSpans(
    output.cycleStart,
    length,
    (date) => isPeriodDay(output, date),
    fertility.kind === 'estimate' ? fertility.window : undefined,
  );
  const phase = phaseOf(output, today);

  return (
    <div class="stack">
      <PageHeader
        eyebrow={longDate(today)}
        title="Today"
        aside={
          phase ? (
            <span class={`pill pill--${PHASE_TONE[phase]}`}>
              <span class="pill__dot" aria-hidden="true" />
              {PHASE_LABEL[phase]}
            </span>
          ) : undefined
        }
      />
      {output.warnings.length > 0 ? <Info card={EMERGENCY_CARD} tone="urgent" /> : null}
      {celebrate ? <Celebrate /> : null}
      <div class="ui-card ring-card">
        <CycleRing
          day={day}
          length={length}
          caption={day === undefined ? 'Log a period to begin' : periodCaption(output, today)}
          spans={spans}
        />
        <RingLegend spans={spans} hasDay={day !== undefined} />
      </div>
      <Button block onClick={() => navigate(`log/${today}`)}>
        {logged ? <PencilIcon /> : <PlusIcon />}
        {logged ? 'Edit today' : 'Log today'}
      </Button>
      {parts.length > 0 || logged?.notes ? (
        <Card heading="Today's log" icon={<CheckIcon />} tone="mint">
          <DayTags parts={parts} extra={logged?.notes ? 'Note added' : undefined} />
        </Card>
      ) : null}
      <NextPeriod output={output} today={today} />
      {fertility.kind === 'estimate' ? <Fertile fertility={fertility} /> : null}
      <details class="ui-card disclosure">
        <summary>
          <Badge tone="sky" small>
            <InfoIcon />
          </Badge>
          <span class="disclosure__title">Good to know</span>
          <ChevronDownIcon class="disclosure__chevron" />
        </summary>
        <div class="stack">
          {INFO_CARDS.map((card) => (
            <Info key={card.id} card={card} />
          ))}
        </div>
      </details>
    </div>
  );
}
