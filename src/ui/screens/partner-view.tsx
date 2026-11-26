import type { ShareCategory } from '../../data/types.ts';
import { addDays, compare, diffDays, inRange, shortLabel, type LocalDate } from '../../lib/date.ts';
import type { SharedDay, Snapshot } from '../../share/snapshot.ts';
import { Card } from '../components.tsx';
import {
  CATEGORY_LABEL,
  COMFORT_LABEL,
  DESIRE_LABEL,
  DISCHARGE_LABEL,
  FLOW_LABEL,
  LEVEL_LABEL,
  MOOD_LABEL,
  PAIN_LABEL,
  SATISFACTION_LABEL,
  SLEEP_QUALITY_LABEL,
  SYMPTOM_LABEL,
} from '../labels.ts';
import { MonthGrid, type MarkSource } from './calendar.tsx';
import { CycleRing } from './today.tsx';

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

function describeDay(day: SharedDay): string[] {
  const parts: string[] = [];
  if (day.flow) parts.push(`Flow: ${FLOW_LABEL[day.flow]}`);
  if (day.soaking) parts.push('Very heavy (soaking)');
  if (day.pain) parts.push(`Pain: ${PAIN_LABEL[day.pain]}`);
  if (day.symptoms?.length) parts.push(day.symptoms.map((s) => SYMPTOM_LABEL[s]).join(', '));
  if (day.energy) parts.push(`Energy: ${LEVEL_LABEL[day.energy]}`);
  if (day.discharge) parts.push(`Discharge: ${DISCHARGE_LABEL[day.discharge]}`);
  if (day.mood?.length) parts.push(`Mood: ${day.mood.map((m) => MOOD_LABEL[m]).join(', ')}`);
  if (day.desire) parts.push(`Desire: ${DESIRE_LABEL[day.desire]}`);
  if (day.sex) {
    const details = [
      day.sex.comfort ? COMFORT_LABEL[day.sex.comfort] : '',
      day.sex.satisfaction ? SATISFACTION_LABEL[day.sex.satisfaction] : '',
    ].filter(Boolean);
    parts.push(`Sex${details.length ? ` (${details.join(', ')})` : ''}`);
  }
  if (day.sleepHours !== undefined) parts.push(`Sleep: ${day.sleepHours} h`);
  if (day.sleepQuality) parts.push(`Sleep quality: ${SLEEP_QUALITY_LABEL[day.sleepQuality]}`);
  if (day.activityMinutes !== undefined) parts.push(`Activity: ${day.activityMinutes} min`);
  if (day.alcohol !== undefined) parts.push(`Alcohol: ${day.alcohol}`);
  if (day.water !== undefined) parts.push(`Water: ${day.water} glasses`);
  return parts;
}

function periodCaption(snapshot: Snapshot, today: LocalDate): string {
  const prediction = snapshot.period?.prediction;
  if (prediction === undefined) return 'No prediction';
  if (compare(today, prediction.lo) < 0) {
    const days = diffDays(today, prediction.center);
    return `Period in about ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (compare(today, prediction.hi) <= 0) return 'Period could start any day';
  return 'Period later than expected';
}

/** What her partner sees. Also used for her "see what he sees" preview. */
export function PartnerView({ snapshot, today }: { snapshot: Snapshot; today: LocalDate }) {
  if (snapshot.paused) {
    return (
      <Card heading="Sharing is paused">
        <p>She has paused sharing for now. Nothing new is visible until she turns it back on.</p>
      </Card>
    );
  }
  if (snapshot.categories.length === 0) {
    return (
      <Card heading="Nothing shared yet">
        <p>She hasn't chosen anything to share yet.</p>
      </Card>
    );
  }
  const period = snapshot.period;
  const cycleDay = period?.cycleStart ? diffDays(period.cycleStart, today) + 1 : undefined;
  const cycleLength =
    period?.cycleStart && period.prediction
      ? Math.max(1, diffDays(period.cycleStart, period.prediction.center))
      : 28;
  const recent = snapshot.days
    .filter((day) => compare(day.date, addDays(today, -6)) >= 0)
    .slice()
    .reverse();
  const shared = snapshot.categories.map(
    (category: ShareCategory) => CATEGORY_LABEL[category].title,
  );

  return (
    <div class="stack">
      {period ? (
        <>
          <CycleRing day={cycleDay} length={cycleLength} caption={periodCaption(snapshot, today)} />
          <Card heading="Next period">
            <p>
              {period.prediction
                ? `Most likely around ${shortLabel(period.prediction.center)} (between ${shortLabel(period.prediction.lo)} and ${shortLabel(period.prediction.hi)}). A rough planning range.`
                : period.basis}
            </p>
          </Card>
        </>
      ) : null}
      {snapshot.fertility ? (
        <Card heading="Fertile window (estimate)">
          <p>
            Around {shortLabel(snapshot.fertility.window.start)} to{' '}
            {shortLabel(snapshot.fertility.window.end)}.
          </p>
          <p class="muted">
            Outside this window the chance is lower, not zero. Pregnancy is possible on any day of
            sex without contraception.
          </p>
        </Card>
      ) : null}
      <MonthGrid today={today} marks={snapshotMarks(snapshot, today)} />
      <Card heading="Last 7 days">
        {recent.length === 0 ? (
          <p class="muted">Nothing logged in the last week.</p>
        ) : (
          <ul class="facts">
            {recent.map((day) => (
              <li key={day.date}>
                <strong>{shortLabel(day.date)}:</strong> {describeDay(day).join(' · ')}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card heading="A reminder">
        <p>
          Logs and patterns describe the past. They never mean she wants sex now — ask, and respect
          the answer.
        </p>
      </Card>
      <p class="muted small">Shared: {shared.join(', ')}.</p>
    </div>
  );
}
