import type { ComponentChildren } from 'preact';
import {
  MIN_DAYS_FOR_PATTERN,
  PHASE_LABEL,
  phasePatterns,
  type Phase,
  type PhasePattern,
  type Share,
} from '../../engine/patterns.ts';
import { ChartArt } from '../art.tsx';
import { useApp } from '../app.tsx';
import { Badge, EmptyState, PageHeader, type Tone } from '../components.tsx';
import {
  CheckIcon,
  FlameIcon,
  HeartIcon,
  MoonIcon,
  PatternsIcon,
  PulseIcon,
  SmileIcon,
  StarIcon,
} from '../icons.tsx';
import { MOOD_EMOJI, MOOD_LABEL } from '../labels.ts';

/** Sleep bars are drawn against this many hours. */
const SLEEP_SCALE_HOURS = 12;

interface Row {
  readonly phase: Phase;
  /** 0 to 1; undefined when there is not enough data yet. */
  readonly fraction?: number;
  readonly value?: string;
  readonly of?: string;
}

/** A rounded bar. Widths are SVG percentages, so no inline styles are needed. */
function Bar(props: { fraction: number | undefined }) {
  if (props.fraction === undefined) {
    return (
      <svg class="metric__bar" aria-hidden="true" focusable="false">
        <rect class="bar-empty" width="100%" height="100%" rx="5" />
      </svg>
    );
  }
  const percent = Math.round(Math.max(0, Math.min(1, props.fraction)) * 1000) / 10;
  return (
    <svg class="metric__bar" aria-hidden="true" focusable="false">
      <rect class="bar-track" width="100%" height="100%" rx="5" />
      {percent > 0 ? <rect class="bar-fill" width={`${percent}%`} height="100%" rx="5" /> : null}
    </svg>
  );
}

function CardHead(props: { title: string; icon: ComponentChildren; tone: Tone }) {
  return (
    <div class="ui-card__head">
      <Badge tone={props.tone}>{props.icon}</Badge>
      <h2 class="ui-card__heading">{props.title}</h2>
    </div>
  );
}

function Metric(props: {
  title: string;
  icon: ComponentChildren;
  tone: Tone;
  rows: readonly Row[];
}) {
  return (
    <section class="ui-card">
      <CardHead title={props.title} icon={props.icon} tone={props.tone} />
      <ul class="metric__rows" role="list">
        {props.rows.map((row) => (
          <li key={row.phase} class="metric__row" data-phase={row.phase}>
            <span class="metric__phase">
              {PHASE_LABEL[row.phase]}
              <span class="visually-hidden">:</span>
            </span>
            {row.value === undefined ? (
              <span class="metric__none">not enough data yet</span>
            ) : (
              <span class="metric__value">
                <strong class="metric__pct">{row.value}</strong>
                {row.of ? <span class="metric__of"> {row.of}</span> : null}
              </span>
            )}
            <Bar fraction={row.fraction} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function shareRows(
  patterns: readonly PhasePattern[],
  pick: (pattern: PhasePattern) => Share,
): Row[] {
  return patterns.map((pattern) => {
    const share = pick(pattern);
    return share.percent === undefined
      ? { phase: pattern.phase }
      : {
          phase: pattern.phase,
          fraction: share.percent / 100,
          value: `${share.percent}%`,
          of: `of ${share.basedOn} days`,
        };
  });
}

function sleepRows(patterns: readonly PhasePattern[]): Row[] {
  return patterns.map((pattern) =>
    pattern.averageSleep === undefined
      ? { phase: pattern.phase }
      : {
          phase: pattern.phase,
          fraction: pattern.averageSleep / SLEEP_SCALE_HOURS,
          value: `${pattern.averageSleep} h`,
          of: 'average',
        },
  );
}

function Moods(props: { patterns: readonly PhasePattern[] }) {
  return (
    <section class="ui-card">
      <CardHead title="Common moods" icon={<SmileIcon />} tone="sun" />
      <ul class="mood-rows" role="list">
        {props.patterns.map((pattern) => (
          <li key={pattern.phase} class="mood-row" data-phase={pattern.phase}>
            <span class="metric__phase">
              {PHASE_LABEL[pattern.phase]}
              <span class="visually-hidden">:</span>
            </span>
            {pattern.topMoods.length > 0 ? (
              <ul class="tags" role="list">
                {pattern.topMoods.map((mood) => (
                  <li key={mood} class="tag tag--mood">
                    <span class="emoji" aria-hidden="true">
                      {MOOD_EMOJI[mood]}
                    </span>
                    {MOOD_LABEL[mood]}
                  </li>
                ))}
              </ul>
            ) : (
              <span class="metric__none">none yet</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Empty(props: { patterns: readonly PhasePattern[] }) {
  return (
    <EmptyState art={<ChartArt />} title="Nothing to show yet">
      <p>
        Log your period and a few days in each part of your cycle. Patterns appear here once a part
        of your cycle has at least {MIN_DAYS_FOR_PATTERN} logged days.
      </p>
      <ul class="phase-progress" role="list">
        {props.patterns.map((pattern) => {
          const logged = Math.min(pattern.loggedDays, MIN_DAYS_FOR_PATTERN);
          return (
            <li key={pattern.phase} class="phase-progress__item" data-phase={pattern.phase}>
              <span class="phase-progress__name">{PHASE_LABEL[pattern.phase]}</span>
              <Bar fraction={logged / MIN_DAYS_FOR_PATTERN} />
              <span class="phase-progress__count">
                {logged} of {MIN_DAYS_FOR_PATTERN} days
              </span>
            </li>
          );
        })}
      </ul>
    </EmptyState>
  );
}

export function Patterns() {
  const { output, days } = useApp();
  const patterns = phasePatterns(output, days);
  const anyFigure = patterns.some(
    (p) =>
      [p.desire, p.sex, p.satisfaction, p.comfort, p.energy].some((s) => s.percent !== undefined) ||
      p.averageSleep !== undefined,
  );
  const anyMood = patterns.some((p) => p.topMoods.length > 0);
  return (
    <div class="stack">
      <PageHeader
        eyebrow="Your rhythm"
        title="Patterns"
        lede="What you logged in each part of your cycle. Patterns describe the past — they never mean what anyone wants now."
      />
      {anyFigure ? (
        <>
          <section class="ui-card">
            <CardHead title="Logged days" icon={<PatternsIcon />} tone="accent" />
            <ul class="phase-tiles" role="list">
              {patterns.map((pattern) => (
                <li key={pattern.phase} class="phase-tile" data-phase={pattern.phase}>
                  <span class="phase-tile__name">{PHASE_LABEL[pattern.phase]}</span>
                  <span class="phase-tile__count">
                    {pattern.loggedDays}
                    <span class="phase-tile__unit">
                      {pattern.loggedDays === 1 ? 'day' : 'days'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p class="field__hint">
              Each figure needs at least {MIN_DAYS_FOR_PATTERN} logged days.
            </p>
          </section>
          <Metric
            title="Desire medium or high"
            icon={<FlameIcon />}
            tone="fertile"
            rows={shareRows(patterns, (p) => p.desire)}
          />
          <Metric
            title="Days with sex"
            icon={<HeartIcon />}
            tone="accent"
            rows={shareRows(patterns, (p) => p.sex)}
          />
          <Metric
            title="Sex rated great"
            icon={<StarIcon />}
            tone="sun"
            rows={shareRows(patterns, (p) => p.satisfaction)}
          />
          <Metric
            title="Sex comfortable or okay"
            icon={<CheckIcon />}
            tone="mint"
            rows={shareRows(patterns, (p) => p.comfort)}
          />
          <Metric
            title="High energy"
            icon={<PulseIcon />}
            tone="peach"
            rows={shareRows(patterns, (p) => p.energy)}
          />
          <Metric title="Average sleep" icon={<MoonIcon />} tone="sky" rows={sleepRows(patterns)} />
          {anyMood ? <Moods patterns={patterns} /> : null}
        </>
      ) : (
        <Empty patterns={patterns} />
      )}
    </div>
  );
}
