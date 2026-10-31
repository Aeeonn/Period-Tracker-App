import { useState } from 'preact/hooks';
import type { ContraceptionMethod, Goal } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { todayLocal } from '../../../lib/localdate/index.ts';
import { useRepositories } from '../../layout/repositories.tsx';
import {
  OPERATOR_DISCLOSURE_TEXT,
  parseLocalDateInput,
  parseOptionalInteger,
  parseReminderTime,
  persistOwnerOnboarding,
  type OnboardingAnswers,
  type OnboardingRole,
} from './model.ts';
import './onboarding.css';

interface OnboardingScreenProps {
  readonly role: OnboardingRole;
  readonly onComplete: () => void;
}

type OnboardingStep = 'basics' | 'reminders' | 'disclosure';

const CONTRACEPTION_OPTIONS: readonly {
  readonly value: ContraceptionMethod;
  readonly label: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'combined_pill', label: 'Combined pill' },
  { value: 'progestogen_only_pill', label: 'Progestogen-only pill' },
  { value: 'patch', label: 'Patch' },
  { value: 'ring', label: 'Ring' },
  { value: 'hormonal_iud', label: 'Hormonal IUD' },
  { value: 'implant', label: 'Implant' },
  { value: 'injection', label: 'Injection' },
  { value: 'copper_iud', label: 'Copper IUD' },
  { value: 'condoms', label: 'Condoms' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const GOAL_OPTIONS: readonly { readonly value: Goal; readonly label: string }[] = [
  { value: 'track', label: 'Track my cycle' },
  { value: 'avoid_pregnancy', label: 'Avoid pregnancy' },
  { value: 'ttc', label: 'Trying to conceive' },
];

export function OnboardingScreen({ role, onComplete }: OnboardingScreenProps) {
  const { logRepo, settingsRepo } = useRepositories();
  const today = todayLocal();
  const [step, setStep] = useState<OnboardingStep>(role === 'owner' ? 'basics' : 'disclosure');
  const [periodDateKnown, setPeriodDateKnown] = useState(false);
  const [periodDateText, setPeriodDateText] = useState('');
  const [cycleLengthText, setCycleLengthText] = useState('');
  const [periodLengthText, setPeriodLengthText] = useState('');
  const [birthYearText, setBirthYearText] = useState('');
  const [goal, setGoal] = useState<Goal>('track');
  const [contraceptionMethod, setContraceptionMethod] =
    useState<ContraceptionMethod>('prefer_not_to_say');
  const [periodReminderEnabled, setPeriodReminderEnabled] = useState(true);
  const [dailyCheckInEnabled, setDailyCheckInEnabled] = useState(false);
  const [dailyCheckInTimeText, setDailyCheckInTimeText] = useState('');
  const [answers, setAnswers] = useState<OnboardingAnswers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairingNotice, setPairingNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  const submitBasics = (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    try {
      let lastPeriodStart: LocalDate | undefined;
      if (periodDateKnown) {
        const parsedDate = parseLocalDateInput(periodDateText, today);
        if (parsedDate === null)
          throw new RangeError('Choose a date or select “I don’t remember.”');
        lastPeriodStart = parsedDate;
      }
      const nextAnswers: OnboardingAnswers = {
        lastPeriodStart,
        typicalCycleLength: parseOptionalInteger(cycleLengthText, 15, 90),
        typicalPeriodLength: parseOptionalInteger(periodLengthText, 1, 90),
        goal,
        birthYear: parseOptionalInteger(birthYearText, 0, Number(today.slice(0, 4))),
        dailyCheckInTime: undefined,
      };
      setAnswers(nextAnswers);
      setStep('reminders');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check your answers and try again.');
    }
  };

  const continueReminders = (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const time = dailyCheckInEnabled ? parseReminderTime(dailyCheckInTimeText) : undefined;
      if (dailyCheckInEnabled && time === undefined) {
        throw new RangeError('Choose a time for your daily check-in, or leave it off.');
      }
      if (answers === null) throw new Error('Your basics are not ready yet.');
      setAnswers({ ...answers, dailyCheckInTime: time });
      setStep('disclosure');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Check your reminder choices and try again.',
      );
    }
  };

  const finish = async () => {
    setError(null);
    setSaving(true);
    try {
      if (role === 'owner') {
        if (answers === null) throw new Error('Your basics are not ready yet.');
        await persistOwnerOnboarding({ logRepo, settingsRepo }, answers);
      }
      onComplete();
    } catch {
      setError('Your setup could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ownerStepNumber = step === 'basics' ? 1 : step === 'reminders' ? 2 : 3;
  const totalSteps = role === 'owner' ? 3 : 1;
  const currentStep = role === 'owner' ? ownerStepNumber : 1;
  const holderMarker = '<the AP-10 account holder>';
  const holderIndex = OPERATOR_DISCLOSURE_TEXT.indexOf(holderMarker);
  const currentYear = Number(today.slice(0, 4));

  return (
    <main class="onboarding-root" data-onboarding-step={step} data-role={role}>
      <section class="onboarding-panel" aria-labelledby="onboarding-title">
        <p class="onboarding-eyebrow">A little space for your cycle</p>
        <div class="onboarding-progress" aria-label={`Step ${currentStep} of ${totalSteps}`}>
          <span>
            Step {currentStep} of {totalSteps}
          </span>
          <span class="onboarding-progress__track" aria-hidden="true">
            <span style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
          </span>
        </div>

        {step === 'basics' && role === 'owner' ? (
          <form onSubmit={submitBasics}>
            <h1 class="onboarding-title" id="onboarding-title">
              Your basics
            </h1>
            <p class="onboarding-lead">
              Share only what feels useful. You can leave anything blank.
            </p>

            <fieldset class="onboarding-fieldset">
              <legend>When did your last period start?</legend>
              <label class="onboarding-option">
                <input
                  checked={!periodDateKnown}
                  name="last-period-known"
                  onChange={() => setPeriodDateKnown(false)}
                  type="radio"
                />
                <span>I don’t remember</span>
              </label>
              <label class="onboarding-option">
                <input
                  checked={periodDateKnown}
                  name="last-period-known"
                  onChange={() => setPeriodDateKnown(true)}
                  type="radio"
                />
                <span>I know the date</span>
              </label>
              <label class="onboarding-label" for="onboarding-period-date">
                Last period start date
              </label>
              <input
                class="onboarding-input"
                disabled={!periodDateKnown}
                id="onboarding-period-date"
                max={today}
                onInput={(event) => setPeriodDateText(event.currentTarget.value)}
                type="date"
                value={periodDateText}
              />
            </fieldset>

            <div class="onboarding-field">
              <label class="onboarding-label" for="onboarding-cycle-length">
                Typical cycle length (days)
              </label>
              <input
                class="onboarding-input"
                id="onboarding-cycle-length"
                max="90"
                min="15"
                onInput={(event) => setCycleLengthText(event.currentTarget.value)}
                placeholder="Not sure"
                step="1"
                type="number"
                value={cycleLengthText}
              />
              <p class="onboarding-hint">Leave this blank if you’re not sure.</p>
            </div>

            <div class="onboarding-field">
              <label class="onboarding-label" for="onboarding-period-length">
                Typical period length (days)
              </label>
              <input
                class="onboarding-input"
                id="onboarding-period-length"
                max="90"
                min="1"
                onInput={(event) => setPeriodLengthText(event.currentTarget.value)}
                placeholder="Not sure"
                step="1"
                type="number"
                value={periodLengthText}
              />
              <p class="onboarding-hint">Leave this blank if you’re not sure.</p>
            </div>

            <div class="onboarding-field">
              <label class="onboarding-label" for="onboarding-contraception">
                Contraception method
              </label>
              <select
                class="onboarding-input"
                id="onboarding-contraception"
                onChange={(event) =>
                  setContraceptionMethod(event.currentTarget.value as ContraceptionMethod)
                }
                value={contraceptionMethod}
              >
                {CONTRACEPTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p class="onboarding-hint">
                This answer stays on this screen for now; setup doesn’t ask for a method start date
                or regimen.
              </p>
            </div>

            <fieldset class="onboarding-fieldset">
              <legend>What would you like to focus on?</legend>
              {GOAL_OPTIONS.map((option) => (
                <label class="onboarding-option" key={option.value}>
                  <input
                    checked={goal === option.value}
                    name="onboarding-goal"
                    onChange={() => setGoal(option.value)}
                    type="radio"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <div class="onboarding-field">
              <label class="onboarding-label" for="onboarding-birth-year">
                Birth year <span class="onboarding-optional">(optional)</span>
              </label>
              <input
                class="onboarding-input"
                id="onboarding-birth-year"
                max={String(currentYear)}
                min="0"
                onInput={(event) => setBirthYearText(event.currentTarget.value)}
                step="1"
                type="number"
                value={birthYearText}
              />
            </div>

            {error ? (
              <p class="onboarding-error" role="alert">
                {error}
              </p>
            ) : null}
            <button class="onboarding-button onboarding-button--primary" type="submit">
              Continue
            </button>
          </form>
        ) : null}

        {step === 'reminders' && role === 'owner' ? (
          <form onSubmit={continueReminders}>
            <h1 class="onboarding-title" id="onboarding-title">
              Gentle reminders
            </h1>
            <p class="onboarding-lead">A small nudge, only if it helps.</p>
            <label class="onboarding-toggle">
              <input
                checked={periodReminderEnabled}
                onChange={(event) => setPeriodReminderEnabled(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>
                <strong>Remind me to log my period while I’m on it</strong>
                <small>On by default</small>
              </span>
            </label>
            <label class="onboarding-toggle">
              <input
                checked={dailyCheckInEnabled}
                onChange={(event) => setDailyCheckInEnabled(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>
                <strong>Daily check-in</strong>
                <small>Off by default</small>
              </span>
            </label>
            <div class="onboarding-field onboarding-time-field">
              <label class="onboarding-label" for="onboarding-checkin-time">
                Choose a time
              </label>
              <input
                class="onboarding-input"
                disabled={!dailyCheckInEnabled}
                id="onboarding-checkin-time"
                onInput={(event) => setDailyCheckInTimeText(event.currentTarget.value)}
                required={dailyCheckInEnabled}
                type="time"
                value={dailyCheckInTimeText}
              />
            </div>
            <p class="onboarding-hint">
              Push permission is separate. This setup won’t ask for it. The period reminder stays on
              this screen because no reminder time is chosen here.
            </p>
            {error ? (
              <p class="onboarding-error" role="alert">
                {error}
              </p>
            ) : null}
            <div class="onboarding-actions">
              <button
                class="onboarding-button onboarding-button--quiet"
                onClick={() => setStep('basics')}
                type="button"
              >
                Back
              </button>
              <button class="onboarding-button onboarding-button--primary" type="submit">
                Continue
              </button>
            </div>
          </form>
        ) : null}

        {step === 'disclosure' ? (
          <>
            <h1 class="onboarding-title" id="onboarding-title">
              Who runs the app’s servers?
            </h1>
            <p class="onboarding-lead">A clear look at how the service works.</p>
            <p class="onboarding-disclosure" data-testid="operator-disclosure">
              {OPERATOR_DISCLOSURE_TEXT.slice(0, holderIndex)}
              <strong>{holderMarker}</strong>
              {OPERATOR_DISCLOSURE_TEXT.slice(holderIndex + holderMarker.length)}
            </p>
            <p class="onboarding-sharing-note">
              Pair now or later. Pairing is never required. Sharing is off until she turns
              categories on.
            </p>
            {pairingNotice ? (
              <p class="onboarding-warning" role="status">
                Pairing isn’t set up in this version. You can continue to Today and return later.
              </p>
            ) : null}
            {error ? (
              <p class="onboarding-error" role="alert">
                {error}
              </p>
            ) : null}
            <div class="onboarding-actions onboarding-actions--stacked">
              {role === 'owner' ? (
                <button
                  class="onboarding-button onboarding-button--quiet"
                  disabled={saving}
                  onClick={() => setStep('reminders')}
                  type="button"
                >
                  Back
                </button>
              ) : null}
              <button
                class="onboarding-button onboarding-button--secondary"
                disabled={saving}
                onClick={() => setPairingNotice(true)}
                type="button"
              >
                Pair now
              </button>
              <button
                class="onboarding-button onboarding-button--primary"
                disabled={saving}
                onClick={() => void finish()}
                type="button"
              >
                {saving ? 'Saving…' : 'Pair later and continue to Today'}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
