import { useState } from 'preact/hooks';
import {
  ACTIVITY_TYPE,
  ALCOHOL_UNITS_MAX,
  ALCOHOL_UNITS_MIN,
  BBT_DISTURBANCE,
  DESIRE,
  DISCHARGE,
  ENERGY,
  FLOW,
  HEAVY_DETAIL,
  LOCHIA,
  MOOD,
  OVULATION_MANUAL,
  PERI_IMPACT_ITEMS,
  PERIOD_PAIN,
  PILL_INTAKE,
  SEX_ACTIVITY,
  SEX_BLEEDING_AFTER,
  SEX_COMFORT,
  SEX_PROTECTION,
  SEX_SATISFACTION,
  SLEEP_HOURS_STEP,
  STRESS,
  SYMPTOMS_BODY,
  ZERO_TO_THREE,
  type ActivityType,
  type BbtDisturbance,
  type Desire,
  type Discharge,
  type Energy,
  type Flow,
  type HeavyDetail,
  type Lochia,
  type Mood,
  type OvulationManual,
  type PeriImpactItem,
  type PeriodPain,
  type PillIntake,
  type Stress,
  type SymptomBody,
  type Tracker,
  type ZeroToThree,
} from '../../../contracts/enums.ts';
import type {
  ActivityLog,
  BbtReading,
  DayBundle,
  MedicationEntry,
  PeriImpact,
  SexEvent,
  SleepLog,
  TestsLog,
} from '../../../contracts/entities.ts';
import type { LocalTime } from '../../../contracts/localdate.ts';
import { Button, Chip } from '../../components/base';
import { optionLabel, TRACKER_LABELS, type LogEntry } from './types.ts';

interface TrackerEditorProps {
  readonly tracker: Tracker;
  readonly day?: DayBundle | undefined;
  readonly disabled: boolean;
  readonly onSave: (entries: readonly LogEntry[]) => void;
  readonly onClear: () => void;
}

interface ChoiceGroupProps<T extends string> {
  readonly legend: string;
  readonly values: readonly T[];
  readonly value: T | undefined;
  readonly onChange: (value: T | undefined) => void;
  readonly disabled: boolean;
}

interface MultiChoiceGroupProps<T extends string> {
  readonly legend: string;
  readonly values: readonly T[];
  readonly value: readonly T[];
  readonly onChange: (value: readonly T[]) => void;
  readonly disabled: boolean;
  readonly exclusive?: T;
}

function ChoiceGroup<T extends string>({
  legend,
  values,
  value,
  onChange,
  disabled,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset class="log-choice-group" disabled={disabled}>
      <legend>{legend}</legend>
      <div class="log-choice-group__choices">
        {values.map((item) => (
          <Chip
            key={item}
            pressed={value === item}
            onPressedChange={(pressed) => onChange(pressed ? item : undefined)}
          >
            {optionLabel(item)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function MultiChoiceGroup<T extends string>({
  legend,
  values,
  value,
  onChange,
  disabled,
  exclusive,
}: MultiChoiceGroupProps<T>) {
  const toggle = (item: T) => {
    if (value.includes(item)) {
      onChange(value.filter((selected) => selected !== item));
    } else if (item === exclusive) {
      onChange([item]);
    } else {
      onChange([...value.filter((selected) => selected !== exclusive), item]);
    }
  };

  return (
    <fieldset class="log-choice-group" disabled={disabled}>
      <legend>{legend}</legend>
      <div class="log-choice-group__choices">
        {values.map((item) => (
          <Chip key={item} pressed={value.includes(item)} onPressedChange={() => toggle(item)}>
            {optionLabel(item)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | 'any';
  readonly unit?: string;
  readonly disabled: boolean;
  readonly onChange: (value: number | undefined) => void;
}

function NumberField({ label, value, min, max, step, unit, disabled, onChange }: NumberFieldProps) {
  return (
    <label class="log-input">
      <span>{label}</span>
      <span class="log-input__with-unit">
        <input
          type="number"
          value={value === undefined ? '' : String(value)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onInput={(event) => {
            const raw = event.currentTarget.value;
            const parsed = raw === '' ? undefined : Number(raw);
            onChange(parsed === undefined || Number.isFinite(parsed) ? parsed : undefined);
          }}
        />
        {unit ? <span>{unit}</span> : null}
      </span>
    </label>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'time';
}

function TextField({ label, value, disabled, onChange, type = 'text' }: TextFieldProps) {
  return (
    <label class="log-input">
      <span>{label}</span>
      {type === 'time' ? (
        <input
          type="time"
          value={value}
          disabled={disabled}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <input
          type="text"
          value={value}

          disabled={disabled}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function SaveBar({
  label,
  disabled,
  canSave,
  canClear,
  onSave,
  onClear,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly canSave: boolean;
  readonly canClear: boolean;
  readonly onSave: () => void;
  readonly onClear: () => void;
}) {
  return (
    <div class="log-editor__actions">
      <Button disabled={disabled || !canSave} onClick={onSave}>
        Save {label}
      </Button>
      {canClear ? (
        <Button variant="quiet" disabled={disabled} onClick={onClear}>
          Clear {label.toLowerCase()} log
        </Button>
      ) : null}
    </div>
  );
}

function hasValue<T extends Tracker>(day: DayBundle | undefined, tracker: T): boolean {
  return day?.[tracker] !== undefined;
}

function initialSexEvents(day: DayBundle | undefined): readonly SexEvent[] {
  return (day?.sex ?? []).map((event) => ({
    ...event,
    activity: [...event.activity],
    protection: [...event.protection],
  }));
}

function updateEvent<T extends keyof SexEvent>(
  events: readonly SexEvent[],
  index: number,
  key: T,
  value: SexEvent[T],
): readonly SexEvent[] {
  return events.map((event, eventIndex) =>
    eventIndex === index ? { ...event, [key]: value } : event,
  );
}

export function TrackerEditor({ tracker, day, disabled, onSave, onClear }: TrackerEditorProps) {
  const [flow, setFlow] = useState<Flow | undefined>(day?.flow);
  const [heavyDetails, setHeavyDetails] = useState<readonly HeavyDetail[]>(day?.heavy_detail ?? []);
  const [periodPain, setPeriodPain] = useState<PeriodPain | undefined>(day?.period_pain);
  const [discharge, setDischarge] = useState<Discharge | undefined>(day?.discharge);
  const [symptoms, setSymptoms] = useState<readonly SymptomBody[]>(day?.symptoms_body ?? []);
  const [mood, setMood] = useState<readonly Mood[]>(day?.mood ?? []);
  const [energy, setEnergy] = useState<Energy | undefined>(day?.energy);
  const [stress, setStress] = useState<Stress | undefined>(day?.stress);
  const [desire, setDesire] = useState<Desire | undefined>(day?.desire);
  const [sexEvents, setSexEvents] = useState<readonly SexEvent[]>(initialSexEvents(day));
  const [pregnancyTest, setPregnancyTest] = useState<TestsLog['pregnancy']>(day?.tests?.pregnancy);
  const [lhTest, setLhTest] = useState<TestsLog['lh']>(day?.tests?.lh);
  const [stiResult, setStiResult] = useState<TestsLog['sti']>(day?.tests?.sti);
  const [emergencyContraception, setEmergencyContraception] = useState<
    TestsLog['emergency_contraception']
  >(day?.tests?.emergency_contraception);
  const [bbtTemp, setBbtTemp] = useState<number | undefined>(day?.bbt?.valueC);
  const [bbtTime, setBbtTime] = useState<string>(day?.bbt?.measuredAt ?? '');
  const [bbtDisturbances, setBbtDisturbances] = useState<readonly BbtDisturbance[]>(
    day?.bbt?.disturbances ?? [],
  );
  const [ovulation, setOvulation] = useState<OvulationManual | undefined>(day?.ovulation_manual);
  const [pillIntake, setPillIntake] = useState<PillIntake | undefined>(day?.pill_intake);
  const [medications, setMedications] = useState<readonly MedicationEntry[]>(
    day?.medication?.map((entry) => ({ ...entry })) ?? [],
  );
  const [weight, setWeight] = useState<number | undefined>(day?.weight);
  const [water, setWater] = useState<number | undefined>(day?.water);
  const [sleepHours, setSleepHours] = useState<number | undefined>(day?.sleep?.hours);
  const [sleepQuality, setSleepQuality] = useState<ZeroToThree | undefined>(day?.sleep?.quality);
  const [activityMinutes, setActivityMinutes] = useState<number | undefined>(
    day?.activity?.minutes,
  );
  const [activityType, setActivityType] = useState<ActivityType | undefined>(day?.activity?.type);
  const [alcohol, setAlcohol] = useState<number | undefined>(day?.alcohol);
  const [notes, setNotes] = useState(day?.notes ?? '');
  const [periImpact, setPeriImpact] = useState<Partial<Record<PeriImpactItem, ZeroToThree>>>(
    day?.peri_impact ? { ...day.peri_impact } : {},
  );
  const [lochia, setLochia] = useState<Lochia | undefined>(day?.lochia);

  const canClear = hasValue(day, tracker);
  const saveBar = (
    canSave: boolean,
    entries: readonly LogEntry[],
    label = TRACKER_LABELS[tracker],
  ) => (
    <SaveBar
      label={label}
      disabled={disabled}
      canSave={canSave}
      canClear={canClear}
      onSave={() => onSave(entries)}
      onClear={onClear}
    />
  );

  let editor;
  switch (tracker) {
    case 'flow': {
      const entries: LogEntry[] = flow === undefined ? [] : [{ tracker: 'flow', value: flow }];
      if ((flow === 'heavy' || flow === 'very_heavy') && heavyDetails.length > 0) {
        entries.push({ tracker: 'heavy_detail', value: heavyDetails });
      }
      editor = (
        <>
          <ChoiceGroup
            legend="Flow level"
            values={FLOW}
            value={flow}
            onChange={setFlow}
            disabled={disabled}
          />
          {flow === 'heavy' || flow === 'very_heavy' ? (
            <MultiChoiceGroup
              legend="Heavy-flow details"
              values={HEAVY_DETAIL}
              value={heavyDetails}
              onChange={setHeavyDetails}
              disabled={disabled}
            />
          ) : null}
          {saveBar(flow !== undefined, entries)}
        </>
      );
      break;
    }
    case 'heavy_detail':
      editor = (
        <>
          <p class="log-editor__hint">
            These details are available when flow is heavy or very heavy.
          </p>
          <MultiChoiceGroup
            legend="Heavy-flow details"
            values={HEAVY_DETAIL}
            value={heavyDetails}
            onChange={setHeavyDetails}
            disabled={disabled}
          />
          {saveBar(heavyDetails.length > 0, [{ tracker: 'heavy_detail', value: heavyDetails }])}
        </>
      );
      break;
    case 'period_pain':
      editor = (
        <>
          <ChoiceGroup
            legend="Period pain"
            values={PERIOD_PAIN}
            value={periodPain}
            onChange={setPeriodPain}
            disabled={disabled}
          />
          {saveBar(
            periodPain !== undefined,
            periodPain === undefined ? [] : [{ tracker: 'period_pain', value: periodPain }],
          )}
        </>
      );
      break;
    case 'discharge':
      editor = (
        <>
          <ChoiceGroup
            legend="Discharge"
            values={DISCHARGE}
            value={discharge}
            onChange={setDischarge}
            disabled={disabled}
          />
          {saveBar(
            discharge !== undefined,
            discharge === undefined ? [] : [{ tracker: 'discharge', value: discharge }],
          )}
        </>
      );
      break;
    case 'symptoms_body':
      editor = (
        <>
          <MultiChoiceGroup
            legend="Symptoms"
            values={SYMPTOMS_BODY}
            value={symptoms}
            onChange={setSymptoms}
            disabled={disabled}
            exclusive={'no_symptoms' as SymptomBody}
          />
          {saveBar(symptoms.length > 0, [{ tracker: 'symptoms_body', value: symptoms }])}
        </>
      );
      break;
    case 'mood':
      editor = (
        <>
          <MultiChoiceGroup
            legend="Mood"
            values={MOOD}
            value={mood}
            onChange={setMood}
            disabled={disabled}
            exclusive={'no_particular_mood' as Mood}
          />
          {saveBar(mood.length > 0, [{ tracker: 'mood', value: mood }])}
        </>
      );
      break;
    case 'energy':
      editor = (
        <>
          <ChoiceGroup
            legend="Energy"
            values={ENERGY.map(String)}
            value={energy === undefined ? undefined : String(energy)}
            onChange={(value) =>
              setEnergy(value === undefined ? undefined : (Number(value) as Energy))
            }
            disabled={disabled}
          />
          {saveBar(
            energy !== undefined,
            energy === undefined ? [] : [{ tracker: 'energy', value: energy }],
          )}
        </>
      );
      break;
    case 'stress':
      editor = (
        <>
          <ChoiceGroup
            legend="Stress"
            values={STRESS.map(String)}
            value={stress === undefined ? undefined : String(stress)}
            onChange={(value) =>
              setStress(value === undefined ? undefined : (Number(value) as Stress))
            }
            disabled={disabled}
          />
          {saveBar(
            stress !== undefined,
            stress === undefined ? [] : [{ tracker: 'stress', value: stress }],
          )}
        </>
      );
      break;
    case 'desire':
      editor = (
        <>
          <p class="log-editor__hint">Just for you, to notice your own patterns.</p>
          <ChoiceGroup
            legend="Desire level"
            values={DESIRE}
            value={desire}
            onChange={setDesire}
            disabled={disabled}
          />
          {saveBar(
            desire !== undefined,
            desire === undefined ? [] : [{ tracker: 'desire', value: desire }],
          )}
        </>
      );
      break;
    case 'sex': {
      const savedSexEvents = sexEvents.filter(
        (event) =>
          event.activity.length > 0 ||
          event.protection.length > 0 ||
          event.comfort !== undefined ||
          event.satisfaction !== undefined ||
          event.bleeding_after !== undefined,
      );
      const hasSexEntry = savedSexEvents.length > 0;
      editor = (
        <>
          <p class="log-editor__hint">
            Private. A log is never a signal of consent and does not turn on sharing.
          </p>
          {sexEvents.map((event, index) => (
            <section class="log-sex-event" key={index} aria-label={`Event ${index + 1}`}>
              <h3>Event {index + 1}</h3>
              <MultiChoiceGroup
                legend="Activity"
                values={SEX_ACTIVITY}
                value={event.activity}
                onChange={(value) => setSexEvents(updateEvent(sexEvents, index, 'activity', value))}
                disabled={disabled}
              />
              <MultiChoiceGroup
                legend="Protection used"
                values={SEX_PROTECTION}
                value={event.protection}
                onChange={(value) =>
                  setSexEvents(updateEvent(sexEvents, index, 'protection', value))
                }
                disabled={disabled}
              />
              <ChoiceGroup
                legend="Comfort and pain"
                values={SEX_COMFORT}
                value={event.comfort}
                onChange={(value) => setSexEvents(updateEvent(sexEvents, index, 'comfort', value))}
                disabled={disabled}
              />
              <ChoiceGroup
                legend="Satisfaction"
                values={SEX_SATISFACTION}
                value={event.satisfaction}
                onChange={(value) =>
                  setSexEvents(updateEvent(sexEvents, index, 'satisfaction', value))
                }
                disabled={disabled}
              />
              <ChoiceGroup
                legend="Bleeding after"
                values={SEX_BLEEDING_AFTER}
                value={event.bleeding_after}
                onChange={(value) =>
                  setSexEvents(updateEvent(sexEvents, index, 'bleeding_after', value))
                }
                disabled={disabled}
              />
              <Button
                variant="quiet"
                disabled={disabled || sexEvents.length < 2}
                onClick={() =>
                  setSexEvents(sexEvents.filter((_, eventIndex) => eventIndex !== index))
                }
              >
                Remove event {index + 1}
              </Button>
            </section>
          ))}
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => setSexEvents([...sexEvents, { activity: [], protection: [] }])}
          >
            Add event
          </Button>
          {saveBar(hasSexEntry, [{ tracker: 'sex', value: savedSexEvents }])}
        </>
      );
      break;
    }
    case 'tests': {
      const tests: TestsLog = {
        ...(pregnancyTest === undefined ? {} : { pregnancy: pregnancyTest }),
        ...(lhTest === undefined ? {} : { lh: lhTest }),
        ...(stiResult === undefined ? {} : { sti: stiResult }),
        ...(emergencyContraception === undefined
          ? {}
          : { emergency_contraception: emergencyContraception }),
      };
      const hasTests = Object.keys(tests).length > 0;
      editor = (
        <>
          <ChoiceGroup
            legend="Pregnancy test"
            values={['positive', 'negative', 'faint_unclear', 'invalid'] as const}
            value={pregnancyTest}
            onChange={setPregnancyTest}
            disabled={disabled}
          />
          <ChoiceGroup
            legend="LH test"
            values={['negative', 'high', 'peak', 'invalid'] as const}
            value={lhTest}
            onChange={setLhTest}
            disabled={disabled}
          />
          <ChoiceGroup
            legend="STI test result"
            values={['positive', 'negative', 'pending'] as const}
            value={stiResult?.result}
            onChange={(result) =>
              setStiResult(result === undefined ? undefined : { taken: true, result })
            }
            disabled={disabled}
          />
          <ChoiceGroup
            legend="Emergency contraception"
            values={['levonorgestrel', 'ulipristal', 'copper_iud', 'other'] as const}
            value={emergencyContraception}
            onChange={setEmergencyContraception}
            disabled={disabled}
          />
          {saveBar(hasTests, [{ tracker: 'tests', value: tests }])}
        </>
      );
      break;
    }
    case 'bbt': {
      const timeIsValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(bbtTime);
      const canSave = bbtTemp !== undefined && timeIsValid;
      const reading: BbtReading = {
        valueC: bbtTemp === undefined ? 0 : Number(bbtTemp.toFixed(2)),
        measuredAt: bbtTime as LocalTime,
        disturbances: bbtDisturbances,
      };
      editor = (
        <>
          <NumberField
            label="Temperature"
            value={bbtTemp}
            step={0.01}
            unit="C"
            disabled={disabled}
            onChange={setBbtTemp}
          />
          <TextField
            label="Measured at"
            type="time"
            value={bbtTime}
            disabled={disabled}
            onChange={setBbtTime}
          />
          <MultiChoiceGroup
            legend="Disturbances"
            values={BBT_DISTURBANCE}
            value={bbtDisturbances}
            onChange={setBbtDisturbances}
            disabled={disabled}
          />
          {saveBar(canSave, canSave ? [{ tracker: 'bbt', value: reading }] : [])}
        </>
      );
      break;
    }
    case 'ovulation_manual':
      editor = (
        <>
          <ChoiceGroup
            legend="Ovulation observation"
            values={OVULATION_MANUAL}
            value={ovulation}
            onChange={setOvulation}
            disabled={disabled}
          />
          {saveBar(
            ovulation !== undefined,
            ovulation === undefined ? [] : [{ tracker: 'ovulation_manual', value: ovulation }],
          )}
        </>
      );
      break;
    case 'pill_intake':
      editor = (
        <>
          <ChoiceGroup
            legend="Pill intake"
            values={PILL_INTAKE}
            value={pillIntake}
            onChange={setPillIntake}
            disabled={disabled}
          />
          {saveBar(
            pillIntake !== undefined,
            pillIntake === undefined ? [] : [{ tracker: 'pill_intake', value: pillIntake }],
          )}
        </>
      );
      break;
    case 'medication': {
      const savedMedications = medications.filter((entry) => entry.name.trim().length > 0);
      const canSave = savedMedications.length > 0;
      editor = (
        <>
          {medications.map((entry, index) => (
            <div class="log-medication" key={index}>
              <TextField
                label={`Medication ${index + 1}`}
                value={entry.name}

                disabled={disabled}
                onChange={(name) =>
                  setMedications(
                    medications.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name } : item,
                    ),
                  )
                }
              />
              <label class="log-checkbox">
                <input
                  type="checkbox"
                  checked={entry.taken}
                  disabled={disabled}
                  onChange={(event) =>
                    setMedications(
                      medications.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, taken: event.currentTarget.checked }
                          : item,
                      ),
                    )
                  }
                />
                Taken
              </label>
              <Button
                variant="quiet"
                disabled={disabled}
                onClick={() =>
                  setMedications(medications.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                Remove medication {index + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => setMedications([...medications, { name: '', taken: false }])}
          >
            Add medication
          </Button>
          {saveBar(canSave, [{ tracker: 'medication', value: savedMedications }])}
        </>
      );
      break;
    }
    case 'weight': {
      const weightIsValid = weight !== undefined && weight >= 0 && Number.isInteger(weight * 10);
      editor = (
        <>
          <NumberField
            label="Weight"
            value={weight}
            min={0}
            step={0.1}
            unit="kg"
            disabled={disabled}
            onChange={setWeight}
          />
          <p class="log-editor__hint">Enter weight to one decimal place.</p>
          {saveBar(weightIsValid, weightIsValid ? [{ tracker: 'weight', value: weight }] : [])}
        </>
      );
      break;
    }
    case 'water':
      editor = (
        <>
          <NumberField
            label="Water"
            value={water}
            min={0}
            step="any"
            unit="ml"
            disabled={disabled}
            onChange={setWater}
          />
          {saveBar(
            water !== undefined && water >= 0,
            water === undefined ? [] : [{ tracker: 'water', value: water }],
          )}
        </>
      );
      break;
    case 'sleep': {
      const sleepIsValid =
        sleepHours !== undefined &&
        sleepHours >= 0 &&
        sleepHours <= 24 &&
        Number.isInteger(sleepHours / SLEEP_HOURS_STEP);
      const canSave = sleepIsValid && sleepQuality !== undefined;
      const sleep: SleepLog = { hours: sleepHours ?? 0, quality: sleepQuality ?? 0 };
      editor = (
        <>
          <NumberField
            label="Hours slept"
            value={sleepHours}
            min={0}
            max={24}
            step={SLEEP_HOURS_STEP}
            unit="hours"
            disabled={disabled}
            onChange={setSleepHours}
          />
          <p class="log-editor__hint">Use half-hour steps.</p>
          <ChoiceGroup
            legend="Sleep quality"
            values={ZERO_TO_THREE.map(String)}
            value={sleepQuality === undefined ? undefined : String(sleepQuality)}
            onChange={(value) =>
              setSleepQuality(value === undefined ? undefined : (Number(value) as ZeroToThree))
            }
            disabled={disabled}
          />
          {saveBar(canSave, canSave ? [{ tracker: 'sleep', value: sleep }] : [])}
        </>
      );
      break;
    }
    case 'activity': {
      const canSave =
        activityMinutes !== undefined && activityMinutes >= 0 && activityType !== undefined;
      const activity: ActivityLog = {
        minutes: activityMinutes ?? 0,
        type: activityType ?? 'other',
      };
      editor = (
        <>
          <NumberField
            label="Minutes"
            value={activityMinutes}
            min={0}
            step="any"
            unit="minutes"
            disabled={disabled}
            onChange={setActivityMinutes}
          />
          <ChoiceGroup
            legend="Activity type"
            values={ACTIVITY_TYPE}
            value={activityType}
            onChange={setActivityType}
            disabled={disabled}
          />
          {saveBar(canSave, canSave ? [{ tracker: 'activity', value: activity }] : [])}
        </>
      );
      break;
    }
    case 'alcohol':
      editor = (
        <>
          <NumberField
            label="Units"
            value={alcohol}
            min={ALCOHOL_UNITS_MIN}
            max={ALCOHOL_UNITS_MAX}
            step="any"
            disabled={disabled}
            onChange={setAlcohol}
          />
          {saveBar(
            alcohol !== undefined && alcohol >= ALCOHOL_UNITS_MIN && alcohol <= ALCOHOL_UNITS_MAX,
            alcohol === undefined
              ? []
              : [
                  {
                    tracker: 'alcohol',
                    value: alcohol,
                  },
                ],
          )}
        </>
      );
      break;
    case 'notes':
      editor = (
        <>
          <label class="log-input">
            <span>Note</span>
            <textarea
              value={notes}

              disabled={disabled}
              onInput={(event) => setNotes(event.currentTarget.value)}
            />
          </label>
          {saveBar(notes.trim().length > 0, [{ tracker: 'notes', value: notes }])}
        </>
      );
      break;
    case 'peri_impact': {
      const canSave = PERI_IMPACT_ITEMS.every((item) => periImpact[item] !== undefined);
      const impact = periImpact as PeriImpact;
      editor = (
        <>
          {PERI_IMPACT_ITEMS.map((item) => (
            <ChoiceGroup
              key={item}
              legend={optionLabel(item)}
              values={ZERO_TO_THREE.map(String)}
              value={periImpact[item] === undefined ? undefined : String(periImpact[item])}
              onChange={(value) =>
                setPeriImpact((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[item];
                  else next[item] = Number(value) as ZeroToThree;
                  return next;
                })
              }
              disabled={disabled}
            />
          ))}
          {saveBar(canSave, canSave ? [{ tracker: 'peri_impact', value: impact }] : [])}
        </>
      );
      break;
    }
    case 'lochia':
      editor = (
        <>
          <ChoiceGroup
            legend="Postpartum bleeding"
            values={LOCHIA}
            value={lochia}
            onChange={setLochia}
            disabled={disabled}
          />
          {saveBar(
            lochia !== undefined,
            lochia === undefined ? [] : [{ tracker: 'lochia', value: lochia }],
          )}
        </>
      );
      break;
  }

  return (
    <section class="log-editor" aria-labelledby="log-editor-title">
      <h2 id="log-editor-title">{TRACKER_LABELS[tracker]}</h2>
      {editor}
    </section>
  );
}
