import type { ShareCategory } from '../../data/types.ts';
import {
  addDays,
  compare,
  diffDays,
  inRange,
  shortLabel,
  weekday,
  type LocalDate,
} from '../../lib/date.ts';
import type { Snapshot } from '../../share/snapshot.ts';
import { PausedArt, WaitingArt } from '../art.tsx';
import { Card, EmptyState } from '../components.tsx';
import { DayTags, describeDay } from '../describe.tsx';
import { CalendarIcon, DropIcon, HeartIcon, SparkleIcon } from '../icons.tsx';
import { CATEGORY_LABEL } from '../labels.ts';
import { CycleRing, RingLegend, ringSpans } from '../ring.tsx';
import { MonthGrid, type MarkSource } from './calendar.tsx';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORY_TAG: Record<ShareCategory, string> = {
  period: 'period',
  fertility: 'fertile',
  body: 'body',
  mood: 'mood',
  desire: 'desire',
  sex: 'sex',
  habits: 'habits',
};

function snapshotMarks(snapshot: Snapshot, today: LocalDate): MarkSource {
  const periodDays = new Set(snapshot.period?.periodDays ?? []);
  const byDate = new Map(snapshot.days.map((day) => [day.date, day]));
  const prediction = snapshot.period?.prediction;
  return {
    period: (day) => periodDays.has(day),
    predicted: (day) =>
      prediction !== undefined &&
      compare(day, today) > 0 &&
      inRange(day, { start: prediction.lo, end: prediction.hi }),
    fertile: (day) => snapshot.fertility !== undefined && inRange(day, snapshot.fertility.window),
    day: (day) => byDate.get(day),
  };
}

function snapshotCaption(snapshot: Snapshot, today: LocalDate): string {
  const prediction = snapshot.period?.prediction;
  if (prediction === undefined) return 'No prediction';
  if (compare(today, prediction.lo) < 0) {
    const days = diffDays(today, prediction.center);
    return `Period in about ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (compare(today, prediction.hi) <= 0) return 'Period could start any day';
  return 'Period later than expected';
}

function NextPeriod({ snapshot, today }: { snapshot: Snapshot; today: LocalDate }) {
  const period = snapshot.period;
  if (period === undefined) return null;
  const prediction = period.prediction;
  if (prediction === undefined) {
    return (
      <Card heading="Next period" icon={<DropIcon />} tone="period">
        <p>{period.basis}</p>
      </Card>
    );
  }
  let big: string;
  let sub: string;
  if (compare(today, prediction.lo) < 0) {
    const days = diffDays(today, prediction.center);
    big = shortLabel(prediction.center);
    sub = `Most likely, in about ${days} ${days === 1 ? 'day' : 'days'}`;
  } else if (compare(today, prediction.hi) <= 0) {
    big = 'Any day now';
    sub = `Most likely around ${shortLabel(prediction.center)}`;
  } else {
    big = 'Later than expected';
    sub = `Expected around ${shortLabel(prediction.center)}`;
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
      <p class="muted small">A rough planning range.</p>
    </Card>
  );
}

/** What her partner sees. Also used for her "see what he sees" preview. */
export function PartnerView({ snapshot, today }: { snapshot: Snapshot; today: LocalDate }) {
  if (snapshot.paused) {
    return (
      <EmptyState art={<PausedArt />} title="Sharing is paused">
        <p class="muted">
          She has paused sharing for now. Nothing new is visible until she turns it back on.
        </p>
      </EmptyState>
    );
  }
  if (snapshot.categories.length === 0) {
    return (
      <EmptyState art={<WaitingArt />} title="Nothing shared yet">
        <p class="muted">She hasn't chosen anything to share yet.</p>
      </EmptyState>
    );
  }
  const period = snapshot.period;
  const cycleDay = period?.cycleStart ? diffDays(period.cycleStart, today) + 1 : undefined;
  const cycleLength =
    period?.cycleStart && period.prediction
      ? Math.max(1, diffDays(period.cycleStart, period.prediction.center))
      : 28;
  const periodDays = new Set(period?.periodDays ?? []);
  const spans = ringSpans(
    period?.cycleStart,
    cycleLength,
    (day) => periodDays.has(day),
    snapshot.fertility?.window,
  );
  const recent = snapshot.days
    .filter((day) => compare(day.date, addDays(today, -6)) >= 0)
    .map((day) => ({ date: day.date, parts: describeDay(day) }))
    .filter((day) => day.parts.length > 0)
    .reverse();

  return (
    <div class="stack">
      {period ? (
        <div class="ui-card ring-card">
          <CycleRing
            day={cycleDay}
            length={cycleLength}
            caption={snapshotCaption(snapshot, today)}
            spans={spans}
          />
          <RingLegend spans={spans} hasDay={cycleDay !== undefined} />
        </div>
      ) : null}
      <NextPeriod snapshot={snapshot} today={today} />
      {snapshot.fertility ? (
        <Card heading="Fertile window (estimate)" icon={<SparkleIcon />} tone="fertile">
          <p class="stat">
            <span class="stat__sub">Around</span>
            <span class="stat__big">
              {shortLabel(snapshot.fertility.window.start)} –{' '}
              {shortLabel(snapshot.fertility.window.end)}
            </span>
          </p>
          <p class="muted">
            Outside this window the chance is lower, not zero. Pregnancy is possible on any day of
            sex without contraception.
          </p>
        </Card>
      ) : null}
      <MonthGrid today={today} marks={snapshotMarks(snapshot, today)} />
      <Card heading="Last 7 days" icon={<CalendarIcon />} tone="sky">
        {recent.length === 0 ? (
          <p class="muted">Nothing logged in the last week.</p>
        ) : (
          <ul class="timeline" role="list">
            {recent.map((day) => (
              <li key={day.date} class="timeline__item">
                <span class="timeline__date" aria-hidden="true">
                  <span class="timeline__weekday">{WEEKDAY_SHORT[weekday(day.date)]}</span>
                  <span class="timeline__num">{Number(day.date.slice(8, 10))}</span>
                </span>
                <div class="timeline__body">
                  <span class="visually-hidden">{shortLabel(day.date)}</span>
                  <DayTags parts={day.parts} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card heading="A reminder" icon={<HeartIcon />} tone="accent">
        <p>
          Logs and patterns describe the past. They never mean she wants sex now — ask, and respect
          the answer.
        </p>
      </Card>
      <div class="shared-with">
        <span>Shared:</span>
        <ul class="tags" role="list">
          {snapshot.categories.map((category) => (
            <li key={category} class={`tag tag--${CATEGORY_TAG[category]}`}>
              {CATEGORY_LABEL[category].title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
