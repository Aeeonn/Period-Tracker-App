import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
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
  type Desire,
  type Flow,
  type Level,
  type Pain,
  type Satisfaction,
  type SleepQuality,
} from '../../data/types.ts';
import { compare, parse } from '../../lib/date.ts';
import { navigate, useApp } from '../app.tsx';
import {
  Button,
  Choice,
  Drops,
  LevelBars,
  MultiChoice,
  PageHeader,
  Section,
  Stepper,
  Toggle,
} from '../components.tsx';
import {
  AlertIcon,
  CheckIcon,
  DropIcon,
  HeartIcon,
  LeafIcon,
  LockIcon,
  NoteIcon,
  PulseIcon,
  SmileIcon,
} from '../icons.tsx';
import {
  COMFORT_LABEL,
  DESIRE_LABEL,
  DISCHARGE_LABEL,
  FLOW_LABEL,
  LEVEL_LABEL,
  MOOD_EMOJI,
  MOOD_LABEL,
  PAIN_LABEL,
  SATISFACTION_LABEL,
  SLEEP_QUALITY_LABEL,
  SYMPTOM_LABEL,
} from '../labels.ts';
import { celebrateSave, longDate } from './today.tsx';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type SectionId = 'sex' | 'period' | 'body' | 'mood' | 'habits' | 'notes';

const SECTION_COUNT = 6;
const NOTES_DELAY_MS = 800;

const SATISFACTION_EMOJI: Record<Satisfaction, string> = { low: '😕', okay: '🙂', high: '🤩' };

function levels<T extends string>(values: Record<T, number>): Record<T, ComponentChildren> {
  const decor = {} as Record<T, ComponentChildren>;
  for (const key of Object.keys(values) as T[]) decor[key] = <LevelBars value={values[key]} />;
  return decor;
}

const DESIRE_DECOR = levels<Desire>({ none: 0, low: 1, medium: 2, high: 3 });
const PAIN_DECOR = levels<Pain>({ none: 0, mild: 1, moderate: 2, severe: 3 });
const ENERGY_DECOR = levels<Level>({ low: 1, medium: 2, high: 3 });
const SLEEP_DECOR = levels<SleepQuality>({ poor: 1, okay: 2, good: 3 });
const FLOW_DECOR: Partial<Record<Flow, ComponentChildren>> = {
  spotting: <Drops count={0} />,
  light: <Drops count={1} />,
  medium: <Drops count={2} />,
  heavy: <Drops count={3} />,
  very_heavy: <Drops count={4} />,
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function summary(parts: readonly unknown[]): string | undefined {
  const text = parts.filter((part) => typeof part === 'string' && part !== '').join(' · ');
  return text === '' ? undefined : text;
}

/** What each section holds, in a few words; undefined when nothing is logged there. */
function summaries(day: DayLog): Record<SectionId, string | undefined> {
  return {
    sex: summary([
      day.sex && 'Had sex',
      day.sex?.comfort && COMFORT_LABEL[day.sex.comfort],
      day.sex?.satisfaction && SATISFACTION_LABEL[day.sex.satisfaction],
      day.desire && `Desire: ${DESIRE_LABEL[day.desire]}`,
    ]),
    period: summary([
      day.flow && `Flow: ${FLOW_LABEL[day.flow]}`,
      day.soaking && 'Soaking',
      day.pain && `Pain: ${PAIN_LABEL[day.pain]}`,
    ]),
    body: summary([
      day.symptoms?.map((symptom) => SYMPTOM_LABEL[symptom]).join(', '),
      day.energy && `Energy: ${LEVEL_LABEL[day.energy]}`,
      day.discharge && `Discharge: ${DISCHARGE_LABEL[day.discharge]}`,
    ]),
    mood: summary([day.mood?.map((mood) => MOOD_LABEL[mood]).join(', ')]),
    habits: summary([
      day.sleepHours !== undefined && `Sleep: ${day.sleepHours} h`,
      day.sleepQuality && `${SLEEP_QUALITY_LABEL[day.sleepQuality]} sleep`,
      day.activityMinutes !== undefined && `${day.activityMinutes} min active`,
      day.alcohol !== undefined && plural(day.alcohol, 'drink', 'drinks'),
      day.water !== undefined && `Water: ${plural(day.water, 'glass', 'glasses')}`,
    ]),
    notes: summary([day.notes && 'Note added']),
  };
}

function Emoji(props: { children: string }) {
  return <span class="emoji">{props.children}</span>;
}

export function LogDay({ date: param }: { date: string | undefined }) {
  const { today, days, saveDay } = useApp();
  const parsed = param === undefined ? today : parse(param);
  const day = parsed !== null && compare(parsed, today) <= 0 ? parsed : today;
  const [draft, setDraft] = useState<DayLog>(
    () => days.find((entry) => entry.date === day) ?? { date: day },
  );
  const [notes, setNotes] = useState(draft.notes ?? '');
  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const logged = summaries(draft);
    return {
      sex: true,
      period: true,
      body: logged.body !== undefined,
      mood: true,
      habits: logged.habits !== undefined,
      notes: logged.notes !== undefined,
    };
  });
  const notesHint = useId();
  const latest = useRef(draft);
  const savedNotes = useRef(draft.notes);
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(saveDay);
  save.current = saveDay;

  function commit(next: DayLog) {
    latest.current = next;
    setDraft(next);
  }

  function update<K extends keyof DayLog>(key: K, value: DayLog[K] | undefined) {
    const next: Mutable<DayLog> = { ...latest.current };
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (key === 'flow' && value !== 'heavy' && value !== 'very_heavy') delete next.soaking;
    commit(next);
    window.clearTimeout(timer.current);
    savedNotes.current = next.notes;
    void save.current(next);
  }

  function flushNotes() {
    window.clearTimeout(timer.current);
    const current = latest.current;
    if (current.notes !== savedNotes.current) {
      savedNotes.current = current.notes;
      void save.current(current);
    }
  }

  function editNotes(text: string) {
    setNotes(text);
    const next: Mutable<DayLog> = { ...latest.current };
    if (text.trim() === '') delete next.notes;
    else next.notes = text;
    commit(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flushNotes, NOTES_DELAY_MS);
  }

  // Typed notes are saved shortly after typing stops, and always when leaving the page.
  useEffect(() => () => flushNotes(), []);

  const toggle = (id: SectionId) => setOpen((state) => ({ ...state, [id]: !state[id] }));
  const logged = summaries(draft);
  const count = Object.values(logged).filter((text) => text !== undefined).length;
  const heavy = draft.flow === 'heavy' || draft.flow === 'very_heavy';
  const sex = draft.sex;
  const isToday = day === today;

  function done() {
    flushNotes();
    if (!isToday) {
      navigate('calendar');
      return;
    }
    if (count > 0) celebrateSave();
    navigate('today');
  }

  const section = (id: SectionId) => ({
    summary: logged[id],
    done: logged[id] !== undefined,
    open: open[id],
    onToggle: () => toggle(id),
  });

  return (
    <div class="stack">
      <PageHeader
        eyebrow={isToday ? longDate(today) : 'Looking back'}
        title={isToday ? 'Daily check-in' : longDate(day)}
        lede="Changes save as you go. Leave anything blank."
      />
      <div class="log-progress">
        <p class="log-progress__text">
          <span>
            {count === 0 ? 'Nothing logged yet' : `${count} of ${SECTION_COUNT} sections logged`}
          </span>
          {count > 0 ? (
            <span class="log-progress__saved">
              <CheckIcon />
              Saved
            </span>
          ) : null}
        </p>
        <div class="meter" data-value={count} aria-hidden="true">
          <span class="meter__fill" />
        </div>
      </div>

      <Section title="Sex & desire" icon={<HeartIcon />} tone="accent" {...section('sex')}>
        <Toggle
          label="Had sex"
          checked={sex !== undefined}
          onChange={(on) => update('sex', on ? {} : undefined)}
        />
        {sex !== undefined ? (
          <div class="subfields">
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
              decor={SATISFACTION_EMOJI}
              value={sex.satisfaction}
              onChange={(satisfaction) =>
                update('sex', {
                  ...(sex.comfort ? { comfort: sex.comfort } : {}),
                  ...(satisfaction ? { satisfaction } : {}),
                })
              }
            />
          </div>
        ) : null}
        <Choice
          label="Desire"
          options={DESIRE}
          labels={DESIRE_LABEL}
          decor={DESIRE_DECOR}
          value={draft.desire}
          onChange={(value) => update('desire', value)}
        />
      </Section>

      <Section title="Period" icon={<DropIcon />} tone="period" {...section('period')}>
        <Choice
          label="Flow"
          options={FLOW}
          labels={FLOW_LABEL}
          decor={FLOW_DECOR}
          value={draft.flow}
          onChange={(value) => update('flow', value)}
        />
        {heavy ? (
          <div class="subfields subfields--alert">
            <Toggle
              label="Soaking a pad or tampon every hour"
              detail="For two hours or more"
              icon={<AlertIcon />}
              tone="period"
              checked={draft.soaking === true}
              onChange={(on) => update('soaking', on ? true : undefined)}
            />
          </div>
        ) : null}
        <Choice
          label="Pain"
          options={PAIN}
          labels={PAIN_LABEL}
          decor={PAIN_DECOR}
          value={draft.pain}
          onChange={(value) => update('pain', value)}
        />
      </Section>

      <Section title="Body" icon={<PulseIcon />} tone="peach" {...section('body')}>
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
          decor={ENERGY_DECOR}
          value={draft.energy}
          onChange={(value) => update('energy', value)}
        />
        <Choice
          label="Discharge"
          options={DISCHARGE}
          labels={DISCHARGE_LABEL}
          value={draft.discharge}
          onChange={(value) => update('discharge', value)}
        />
      </Section>

      <Section title="Mood" icon={<SmileIcon />} tone="sun" {...section('mood')}>
        <MultiChoice
          label="How did you feel?"
          options={MOODS}
          labels={MOOD_LABEL}
          decor={MOOD_EMOJI}
          value={draft.mood}
          onChange={(value) => update('mood', value.length ? value : undefined)}
        />
      </Section>

      <Section title="Habits" icon={<LeafIcon />} tone="mint" {...section('habits')}>
        <Stepper
          label="Sleep"
          unit="h"
          max={16}
          icon={<Emoji>😴</Emoji>}
          tone="sky"
          value={draft.sleepHours}
          onChange={(value) => update('sleepHours', value)}
        />
        <Choice
          label="Sleep quality"
          options={SLEEP_QUALITY}
          labels={SLEEP_QUALITY_LABEL}
          decor={SLEEP_DECOR}
          value={draft.sleepQuality}
          onChange={(value) => update('sleepQuality', value)}
        />
        <Stepper
          label="Activity"
          unit="min"
          step={15}
          max={600}
          icon={<Emoji>🏃</Emoji>}
          tone="mint"
          value={draft.activityMinutes}
          onChange={(value) => update('activityMinutes', value)}
        />
        <Stepper
          label="Alcohol"
          unit="drinks"
          unitOne="drink"
          max={20}
          icon={<Emoji>🍷</Emoji>}
          tone="peach"
          value={draft.alcohol}
          onChange={(value) => update('alcohol', value)}
        />
        <Stepper
          label="Water"
          unit="glasses"
          unitOne="glass"
          max={20}
          icon={<Emoji>💧</Emoji>}
          tone="sky"
          value={draft.water}
          onChange={(value) => update('water', value)}
        />
      </Section>

      <Section title="Notes" icon={<NoteIcon />} tone="sky" {...section('notes')}>
        <label class="field">
          <span class="visually-hidden">Note</span>
          <textarea
            rows={4}
            maxLength={2000}
            value={notes}
            placeholder="Anything you'd like to remember"
            aria-describedby={notesHint}
            onInput={(event) => editNotes(event.currentTarget.value)}
            onBlur={flushNotes}
          />
        </label>
        <p id={notesHint} class="field__hint notes-hint">
          <LockIcon />
          Private. Never shared.
        </p>
      </Section>

      <Button block onClick={done}>
        <CheckIcon />
        Done
      </Button>
    </div>
  );
}
