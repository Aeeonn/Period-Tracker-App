import { cycleDay, type EngineOutput } from '../../engine/index.ts';
import { diffDays, shortLabel, type LocalDate } from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';
import { Button, Card, Info } from '../components.tsx';
import { EMERGENCY_CARD, INFO_CARDS } from '../content.ts';

/** Ring showing how far through the expected cycle today is. */
export function CycleRing(props: { day: number | undefined; length: number; caption: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = props.day === undefined ? 0 : Math.min(1, props.day / props.length);
  return (
    <div class="ring">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} class="ring__track" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          class="ring__progress"
          stroke-dasharray={`${progress * circumference} ${circumference}`}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div class="ring__label">
        <strong>{props.day === undefined ? '—' : `Day ${props.day}`}</strong>
        <span>{props.caption}</span>
      </div>
    </div>
  );
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

export function predictionText(output: EngineOutput): string {
  const prediction = output.prediction;
  if (prediction.kind === 'none') return output.basis;
  return `Next period most likely around ${shortLabel(prediction.center)} (between ${shortLabel(prediction.lo)} and ${shortLabel(prediction.hi)}). This is a rule-of-thumb planning range, not a calibrated probability interval. ${output.basis}`;
}

export function Today() {
  const { today, output, days, settings } = useApp();
  const day = cycleDay(output, today);
  const length =
    output.prediction.kind === 'prediction'
      ? output.prediction.cycleLength
      : (settings.cycleLength ?? 28);
  const logged = days.find((entry) => entry.date === today);
  const fertility = output.fertility;

  return (
    <div class="stack">
      <h1 class="visually-hidden">Today</h1>
      {output.warnings.length > 0 ? <Info card={EMERGENCY_CARD} tone="urgent" /> : null}
      <CycleRing day={day} length={length} caption={periodCaption(output, today)} />
      <Button onClick={() => navigate(`log/${today}`)}>
        {logged ? 'Edit today' : 'Log today'}
      </Button>
      <Card heading="Next period">
        <p>{predictionText(output)}</p>
      </Card>
      {fertility.kind === 'estimate' ? (
        <Card heading="Fertile window (estimate)">
          <p>
            Around {shortLabel(fertility.window.start)} to {shortLabel(fertility.window.end)}.
            {fertility.copperIud ? ' Your method does not change ovulation.' : ''}
          </p>
          <p class="muted">
            Lower — not zero. Pregnancy is possible on any day you have sex without contraception.
          </p>
        </Card>
      ) : null}
      <details class="ui-card">
        <summary>Good to know</summary>
        <div class="stack">
          {INFO_CARDS.map((card) => (
            <Info key={card.id} card={card} />
          ))}
        </div>
      </details>
    </div>
  );
}
