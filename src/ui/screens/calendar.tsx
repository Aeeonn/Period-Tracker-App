import { useState } from 'preact/hooks';
import type { DayLog } from '../../data/types.ts';
import { isPeriodDay, type EngineOutput } from '../../engine/index.ts';
import {
  addDays,
  compare,
  date,
  inRange,
  shortLabel,
  weekday,
  type LocalDate,
} from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';
import { Button, PageHeader } from '../components.tsx';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon } from '../icons.tsx';

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

function HeartMark() {
  return (
    <svg class="calendar__heart" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M5 9S.8 6.4.8 3.3A2.2 2.2 0 0 1 5 2.2a2.2 2.2 0 0 1 4.2 1.1C9.2 6.4 5 9 5 9z" />
    </svg>
  );
}

function Legend() {
  return (
    <ul class="legend" role="list">
      <li class="legend__item">
        <span class="legend__swatch legend__swatch--period" aria-hidden="true" />
        Period
      </li>
      <li class="legend__item">
        <span class="legend__swatch legend__swatch--predicted" aria-hidden="true" />
        Expected
      </li>
      <li class="legend__item">
        <span class="legend__swatch legend__swatch--fertile" aria-hidden="true" />
        Fertile (estimate)
      </li>
      <li class="legend__item">
        <span class="legend__swatch legend__swatch--today" aria-hidden="true" />
        Today
      </li>
      <li class="legend__item">
        <span class="legend__swatch" aria-hidden="true">
          <span class="calendar__dot" />
        </span>
        Logged
      </li>
      <li class="legend__item">
        <span class="legend__swatch" aria-hidden="true">
          <HeartMark />
        </span>
        Sex
      </li>
    </ul>
  );
}

/** Month grid; each day up to today links to `link(day)` when given. */
export function MonthGrid(props: {
  today: LocalDate;
  marks: MarkSource;
  link?: (day: LocalDate) => string;
}) {
  const [view, setView] = useState(() => ({
    month: monthStart(props.today),
    dir: 'none' as 'none' | 'prev' | 'next',
  }));
  const month = view.month;
  const first = addDays(month, -weekday(month));
  const next = shiftMonth(month, 1);
  const cells: LocalDate[] = [];
  for (let day = first; compare(day, next) < 0 || cells.length % 7 !== 0; day = addDays(day, 1)) {
    cells.push(day);
  }
  const title = `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  return (
    <section class="ui-card calendar-card">
      <div class="calendar">
        <div class="calendar__head">
          <button
            type="button"
            class="ui-chip ui-chip--round"
            aria-label="Previous month"
            onClick={() => setView({ month: shiftMonth(month, -1), dir: 'prev' })}
          >
            <ChevronLeftIcon />
          </button>
          <h2 class="calendar__title" aria-live="polite">
            <span class="calendar__month" key={month}>
              {title}
            </span>
          </h2>
          <button
            type="button"
            class="ui-chip ui-chip--round"
            aria-label="Next month"
            onClick={() => setView({ month: shiftMonth(month, 1), dir: 'next' })}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <div class="calendar__weekdays" aria-hidden="true">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
            <span key={index} class="calendar__weekday">
              {label}
            </span>
          ))}
        </div>
        <div class="calendar__grid" key={month} data-dir={view.dir}>
          {cells.map((day) => {
            const inMonth = day.slice(0, 7) === month.slice(0, 7);
            const log = props.marks.day(day);
            const period = props.marks.period(day);
            const predicted = props.marks.predicted(day);
            const fertile = props.marks.fertile(day);
            const isToday = day === props.today;
            const classes = [
              'calendar__day',
              inMonth ? '' : 'calendar__day--outside',
              period ? 'is-period' : '',
              predicted ? 'is-predicted' : '',
              fertile ? 'is-fertile' : '',
              isToday ? 'is-today' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const label = [
              shortLabel(day),
              isToday ? 'today' : '',
              period ? 'period' : '',
              predicted ? 'period expected' : '',
              fertile ? 'fertile window (estimate)' : '',
              log?.sex ? 'sex' : log ? 'logged' : '',
            ]
              .filter(Boolean)
              .join(', ');
            const content = (
              <>
                <span aria-hidden="true">{Number(day.slice(8, 10))}</span>
                <span class="calendar__mark" aria-hidden="true">
                  {log?.sex ? <HeartMark /> : log ? <span class="calendar__dot" /> : null}
                </span>
              </>
            );
            const future = compare(day, props.today) > 0;
            return props.link && !future ? (
              <a key={day} href={props.link(day)} class={classes} aria-label={label}>
                {content}
              </a>
            ) : (
              <span key={day} class={classes}>
                {content}
                <span class="visually-hidden">{label}</span>
              </span>
            );
          })}
        </div>
        <Legend />
      </div>
    </section>
  );
}

export function Calendar() {
  const { today, output, days } = useApp();
  const logged = days.some((entry) => entry.date === today);
  return (
    <div class="stack">
      <PageHeader eyebrow="Your month" title="Calendar" />
      <MonthGrid today={today} marks={ownerMarks(output, days)} link={(day) => `#/log/${day}`} />
      <div class="calendar-foot">
        <p class="muted center small">Tap a day to log or edit it.</p>
        <Button variant="secondary" block onClick={() => navigate(`log/${today}`)}>
          {logged ? <PencilIcon /> : <PlusIcon />}
          {logged ? 'Edit today' : 'Log today'}
        </Button>
      </div>
    </div>
  );
}
