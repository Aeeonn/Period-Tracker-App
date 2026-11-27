import type { SharedDay } from '../share/snapshot.ts';
import {
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
} from './labels.ts';

export type PartKind = 'period' | 'body' | 'mood' | 'desire' | 'sex' | 'habits';

export interface DayPart {
  readonly kind: PartKind;
  readonly text: string;
}

/** Plain-language pieces of a logged day, in a stable order. Notes are never included. */
export function describeDay(day: SharedDay): DayPart[] {
  const parts: DayPart[] = [];
  const add = (kind: PartKind, text: string) => parts.push({ kind, text });
  if (day.flow) add('period', `Flow: ${FLOW_LABEL[day.flow]}`);
  if (day.soaking) add('period', 'Very heavy (soaking)');
  if (day.pain) add('period', `Pain: ${PAIN_LABEL[day.pain]}`);
  if (day.symptoms?.length) add('body', day.symptoms.map((s) => SYMPTOM_LABEL[s]).join(', '));
  if (day.energy) add('body', `Energy: ${LEVEL_LABEL[day.energy]}`);
  if (day.discharge) add('body', `Discharge: ${DISCHARGE_LABEL[day.discharge]}`);
  if (day.mood?.length) add('mood', `Mood: ${day.mood.map((m) => MOOD_LABEL[m]).join(', ')}`);
  if (day.desire) add('desire', `Desire: ${DESIRE_LABEL[day.desire]}`);
  if (day.sex) {
    const details = [
      day.sex.comfort ? COMFORT_LABEL[day.sex.comfort] : '',
      day.sex.satisfaction ? SATISFACTION_LABEL[day.sex.satisfaction] : '',
    ].filter(Boolean);
    add('sex', `Sex${details.length ? ` (${details.join(', ')})` : ''}`);
  }
  if (day.sleepHours !== undefined) add('habits', `Sleep: ${day.sleepHours} h`);
  if (day.sleepQuality) add('habits', `Sleep quality: ${SLEEP_QUALITY_LABEL[day.sleepQuality]}`);
  if (day.activityMinutes !== undefined) add('habits', `Activity: ${day.activityMinutes} min`);
  if (day.alcohol !== undefined) add('habits', `Alcohol: ${day.alcohol}`);
  if (day.water !== undefined) add('habits', `Water: ${day.water} glasses`);
  return parts;
}

export function DayTags(props: { parts: readonly DayPart[]; extra?: string | undefined }) {
  return (
    <ul class="tags" role="list">
      {props.parts.map((part) => (
        <li key={part.text} class={`tag tag--${part.kind}`}>
          {part.text}
        </li>
      ))}
      {props.extra ? <li class="tag">{props.extra}</li> : null}
    </ul>
  );
}
