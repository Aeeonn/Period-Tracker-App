import { useState } from 'preact/hooks';
import {
  COMFORT,
  DESIRE,
  DISCHARGE,
  FLOW,
  LEVEL,
  MOODS,
  PAIN,
  SATISFACTION,
  SLEEP_QUALITY,
  SYMPTOMS,
  type DayLog,
} from '../../data/types.ts';
import { compare, parse, shortLabel } from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';
import { Button, Card, Choice, MultiChoice, Stepper, Toggle } from '../components.tsx';
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
} from '../labels.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function LogDay({ date: param }: { date: string | undefined }) {
  const { today, days, saveDay } = useApp();
  const parsed = param === undefined ? today : parse(param);
  const day = parsed !== null && compare(parsed, today) <= 0 ? parsed : today;
  const [draft, setDraft] = useState<DayLog>(
    () => days.find((entry) => entry.date === day) ?? { date: day },
  );
  const [notes, setNotes] = useState(draft.notes ?? '');

  function update<K extends keyof DayLog>(key: K, value: DayLog[K] | undefined) {
    const next: Mutable<DayLog> = { ...draft };
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (key === 'flow' && value !== 'heavy' && value !== 'very_heavy') delete next.soaking;
    setDraft(next);
    void saveDay(next);
  }

  const heavy = draft.flow === 'heavy' || draft.flow === 'very_heavy';
  const sex = draft.sex;

  return (
    <div class="stack">
      <h1>{day === today ? 'Today' : shortLabel(day)}</h1>
      <p class="muted">Changes save as you go. Leave anything blank.</p>

      <Card heading="Sex">
        <Toggle
          label="Had sex"
          checked={sex !== undefined}
          onChange={(on) => update('sex', on ? {} : undefined)}
        />
        {sex !== undefined ? (
          <>
            <Choice
              label="Comfort"
              options={COMFORT}
              labels={COMFORT_LABEL}
              value={sex.comfort}
              onChange={(comfort) =>
                update('sex', {
                  ...(sex.satisfaction ? { satisfaction: sex.satisfaction } : {}),
                  ...(comfort ? { comfort } : {}),
                })
              }
            />
            <Choice
              label="How was it?"
              options={SATISFACTION}
              labels={SATISFACTION_LABEL}
              value={sex.satisfaction}
              onChange={(satisfaction) =>
                update('sex', {
                  ...(sex.comfort ? { comfort: sex.comfort } : {}),
                  ...(satisfaction ? { satisfaction } : {}),
                })
              }
            />
          </>
        ) : null}
        <Choice
          label="Desire"
          options={DESIRE}
          labels={DESIRE_LABEL}
          value={draft.desire}
          onChange={(value) => update('desire', value)}
        />
      </Card>

      <Card heading="Period">
        <Choice
          label="Flow"
          options={FLOW}
          labels={FLOW_LABEL}
          value={draft.flow}
          onChange={(value) => update('flow', value)}
        />
        {heavy ? (
          <Toggle
            label="Soaking a pad or tampon every hour"
            detail="For two hours or more"
            checked={draft.soaking === true}
            onChange={(on) => update('soaking', on ? true : undefined)}
          />
        ) : null}
        <Choice
          label="Pain"
          options={PAIN}
          labels={PAIN_LABEL}
          value={draft.pain}
          onChange={(value) => update('pain', value)}
        />
        <Choice
          label="Discharge"
          options={DISCHARGE}
          labels={DISCHARGE_LABEL}
          value={draft.discharge}
          onChange={(value) => update('discharge', value)}
        />
      </Card>

      <Card heading="Body">
        <MultiChoice
          label="Symptoms"
          options={SYMPTOMS}
          labels={SYMPTOM_LABEL}
          value={draft.symptoms}
          onChange={(value) => update('symptoms', value.length ? value : undefined)}
        />
        <Choice
          label="Energy"
          options={LEVEL}
          labels={LEVEL_LABEL}
          value={draft.energy}
          onChange={(value) => update('energy', value)}
        />
      </Card>

      <Card heading="Mood">
        <MultiChoice
          label="Mood"
          options={MOODS}
          labels={MOOD_LABEL}
          value={draft.mood}
          onChange={(value) => update('mood', value.length ? value : undefined)}
        />
      </Card>

      <Card heading="Habits">
        <Stepper
          label="Sleep"
          unit="h"
          max={16}
          value={draft.sleepHours}
          onChange={(value) => update('sleepHours', value)}
        />
        <Choice
          label="Sleep quality"
          options={SLEEP_QUALITY}
          labels={SLEEP_QUALITY_LABEL}
          value={draft.sleepQuality}
          onChange={(value) => update('sleepQuality', value)}
        />
        <Stepper
          label="Activity"
          unit="min"
          step={15}
          max={600}
          value={draft.activityMinutes}
          onChange={(value) => update('activityMinutes', value)}
        />
        <Stepper
          label="Alcohol"
          unit="drinks"
          max={20}
          value={draft.alcohol}
          onChange={(value) => update('alcohol', value)}
        />
        <Stepper
          label="Water"
          unit="glasses"
          max={20}
          value={draft.water}
          onChange={(value) => update('water', value)}
        />
      </Card>

      <Card heading="Notes">
        <label class="field">
          <span class="muted">Private. Never shared.</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onInput={(event) => setNotes(event.currentTarget.value)}
            onBlur={() => update('notes', notes.trim() === '' ? undefined : notes)}
          />
        </label>
      </Card>

      <Button
        variant="secondary"
        onClick={() => {
          if ((draft.notes ?? '') !== notes) void saveDay({ ...draft, notes });
          navigate('today');
        }}
      >
        Done
      </Button>
    </div>
  );
}
