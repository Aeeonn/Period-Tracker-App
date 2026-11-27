import { useId } from 'preact/hooks';
import { addDays, diffDays, type DateRange, type LocalDate } from '../lib/date.ts';
import { DropIcon } from './icons.tsx';

const R = 84;
/** A circle drawn as a path that starts at the top and runs clockwise. */
const CIRCLE = `M100 ${100 - R}a${R} ${R} 0 1 1 0 ${2 * R}a${R} ${R} 0 1 1 0 ${-2 * R}`;

/** A run of cycle days; `start` is the 1-based cycle day. */
export interface RingSpan {
  readonly start: number;
  readonly days: number;
}

export interface RingSpans {
  readonly period?: RingSpan;
  readonly fertile?: RingSpan;
}

/** Where the period and the estimated fertile window sit in the current cycle. */
export function ringSpans(
  cycleStart: LocalDate | undefined,
  length: number,
  isPeriod: (date: LocalDate) => boolean,
  fertile: DateRange | undefined,
): RingSpans {
  if (cycleStart === undefined) return {};
  let periodDays = 0;
  while (periodDays < length && isPeriod(addDays(cycleStart, periodDays))) periodDays += 1;
  let fertileSpan: RingSpan | undefined;
  if (fertile !== undefined) {
    const start = Math.max(1, diffDays(cycleStart, fertile.start) + 1);
    const end = Math.min(length, diffDays(cycleStart, fertile.end) + 1);
    if (end >= start) fertileSpan = { start, days: end - start + 1 };
  }
  return {
    ...(periodDays > 0 ? { period: { start: 1, days: periodDays } } : {}),
    ...(fertileSpan ? { fertile: fertileSpan } : {}),
  };
}

function Arc(props: { class: string; from: number; size: number; stroke?: string }) {
  return (
    <path
      class={props.class}
      d={CIRCLE}
      pathLength={100}
      stroke-dasharray={`${props.size} 100`}
      stroke-dashoffset={-props.from}
      stroke={props.stroke}
    />
  );
}

/** Ring showing how far through the expected cycle today is. The text inside carries the meaning. */
export function CycleRing(props: {
  day: number | undefined;
  length: number;
  caption: string;
  spans?: RingSpans;
}) {
  const id = useId();
  const length = Math.max(1, props.length);
  const percent = (days: number) => Math.max(0, Math.min(100, (100 * days) / length));

  if (props.day === undefined) {
    return (
      <div class="ring ring--empty">
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <path class="ring__track" d={CIRCLE} pathLength={100} />
          <circle class="ring__orbit" cx="100" cy={100 - R} r="7" />
        </svg>
        <div class="ring__label">
          <DropIcon class="ring__empty-icon" />
          <span class="ring__empty-title">No cycle yet</span>
          <span class="ring__caption">{props.caption}</span>
        </div>
      </div>
    );
  }

  const position = Math.min(props.day, length) - 0.5;
  const angle = (2 * Math.PI * position) / length;
  const x = (100 + R * Math.sin(angle)).toFixed(2);
  const y = (100 - R * Math.cos(angle)).toFixed(2);
  const { period, fertile } = props.spans ?? {};
  return (
    <div class="ring">
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" class="ring__stop-a" />
            <stop offset="1" class="ring__stop-b" />
          </linearGradient>
        </defs>
        <path class="ring__track" d={CIRCLE} pathLength={100} />
        {period ? (
          <Arc
            class="ring__seg ring__seg--period"
            from={percent(period.start - 1)}
            size={percent(period.days)}
          />
        ) : null}
        {fertile ? (
          <Arc
            class="ring__seg ring__seg--fertile"
            from={percent(fertile.start - 1)}
            size={percent(fertile.days)}
          />
        ) : null}
        <Arc class="ring__progress" from={0} size={percent(position)} stroke={`url(#${id}-g)`} />
        <circle class="ring__marker" cx={x} cy={y} r="11" />
        <circle class="ring__marker-dot" cx={x} cy={y} r="4.5" />
      </svg>
      <div class="ring__label">
        <strong class="ring__day">
          <span class="ring__day-word">Day</span> <span class="ring__day-num">{props.day}</span>
        </strong>
        <span class="ring__caption">{props.caption}</span>
      </div>
    </div>
  );
}

/** Legend for the ring; only lists what the ring shows. */
export function RingLegend(props: { spans: RingSpans; hasDay: boolean }) {
  if (!props.hasDay) return null;
  return (
    <ul class="ring-legend" role="list">
      {props.spans.period ? (
        <li class="ring-legend__item">
          <span class="swatch swatch--period" aria-hidden="true" />
          Period
        </li>
      ) : null}
      {props.spans.fertile ? (
        <li class="ring-legend__item">
          <span class="swatch swatch--fertile" aria-hidden="true" />
          Fertile (estimate)
        </li>
      ) : null}
      <li class="ring-legend__item">
        <span class="swatch swatch--today" aria-hidden="true" />
        Today
      </li>
    </ul>
  );
}
