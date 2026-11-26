import { useState } from 'preact/hooks';
import type { DayLog } from '../../data/types.ts';
import { isPeriodDay, type EngineOutput } from '../../engine/index.ts';
import { addDays, compare, date, inRange, weekday, type LocalDate } from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthStart(value: LocalDate): LocalDate {
  return date(`${value.slice(0, 7)}-01`);
}

function shiftMonth(start: LocalDate, by: number): LocalDate {
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7)) - 1 + by;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return date(`${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-01`);
}

export interface DayMarks {
  readonly period: boolean;
  readonly predicted: boolean;
  readonly fertile: boolean;
  readonly sex: boolean;
  readonly logged: boolean;
}

export type MarkSource = {
  readonly period: (day: LocalDate) => boolean;
  readonly predicted: (day: LocalDate) => boolean;
  readonly fertile: (day: LocalDate) => boolean;
  readonly day: (day: LocalDate) => Partial<DayLog> | undefined;
};

export function ownerMarks(output: EngineOutput, days: readonly DayLog[]): MarkSource {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const prediction = output.prediction;
  const fertility = output.fertility;
  return {
    period: (day) => isPeriodDay(output, day),
    predicted: (day) =>
      prediction.kind === 'prediction' &&
      compare(day, output.today) > 0 &&
      inRange(day, { start: prediction.lo, end: prediction.hi }),
    fertile: (day) => fertility.kind === 'estimate' && inRange(day, fertility.window),
    day: (day) => byDate.get(day),
  };
}

/** Month grid; each day links to `link(day)` when given. */
export function MonthGrid(props: {
  today: LocalDate;
  marks: MarkSource;
  link?: (day: LocalDate) => string;
}) {
  const [month, setMonth] = useState(() => monthStart(props.today));
  const first = addDays(month, -weekday(month));
  const next = shiftMonth(month, 1);
  const cells: LocalDate[] = [];
  for (let day = first; compare(day, next) < 0 || cells.length % 7 !== 0; day = addDays(day, 1)) {
    cells.push(day);
  }
  return (
    <div class="calendar">
      <div class="row calendar__head">
        <button
          type="button"
          class="ui-chip"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <h2>
          {MONTH_NAMES[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
        </h2>
        <button
          type="button"
          class="ui-chip"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      <div class="calendar__grid" role="grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
          <span key={index} class="calendar__weekday" aria-hidden="true">
            {label}
          </span>
        ))}
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === month.slice(0, 7);
          const log = props.marks.day(day);
          const classes = [
            'calendar__day',
            inMonth ? '' : 'calendar__day--outside',
            props.marks.period(day) ? 'is-period' : '',
            props.marks.predicted(day) ? 'is-predicted' : '',
            props.marks.fertile(day) ? 'is-fertile' : '',
            day === props.today ? 'is-today' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const content = (
            <>
              <span>{Number(day.slice(8, 10))}</span>
              {log?.sex ? (
                <span class="dot dot--sex" aria-label="sex" />
              ) : log ? (
                <span class="dot" aria-hidden="true" />
              ) : null}
            </>
          );
          const future = compare(day, props.today) > 0;
          return props.link && !future ? (
            <a key={day} href={props.link(day)} class={classes} aria-label={day}>
              {content}
            </a>
          ) : (
            <span key={day} class={classes} aria-label={day}>
              {content}
            </span>
          );
        })}
      </div>
      <p class="legend muted">
        <span class="swatch is-period" /> Period <span class="swatch is-predicted" /> Expected
        <span class="swatch is-fertile" /> Fertile (estimate) <span class="dot dot--sex" /> Sex
      </p>
    </div>
  );
}

export function Calendar() {
  const { today, output, days } = useApp();
  return (
    <div class="stack">
      <h1>Calendar</h1>
      <MonthGrid today={today} marks={ownerMarks(output, days)} link={(day) => `#/log/${day}`} />
      <p class="muted">Tap a day to log or edit it.</p>
      <button
        type="button"
        class="ui-button ui-button--secondary"
        onClick={() => navigate(`log/${today}`)}
      >
        Log today
      </button>
    </div>
  );
}
