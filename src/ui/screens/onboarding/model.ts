import type { ReminderId } from '../../../contracts/brand.ts';
import type { Profile, ReminderRule } from '../../../contracts/entities.ts';
import type { Goal, IsoWeekday } from '../../../contracts/enums.ts';
import type { LocalDate, LocalTime } from '../../../contracts/localdate.ts';
import type { LogRepo, SettingsRepo } from '../../../contracts/store.ts';
import { compare, parse } from '../../../lib/localdate/index.ts';

export type OnboardingRole = 'owner' | 'partner';

export const OPERATOR_DISCLOSURE_TEXT =
  "This app's website and its encrypted mailbox run on a free Cloudflare account held by <the AP-10 account holder>. That person can't read your encrypted data. They can see when your phone connects and roughly where from, and they could change the app's code. The mailbox is set up to keep no logs, but its owner could turn logging back on. If you'd rather hold the account yourself, that can be arranged.";

export interface OnboardingAnswers {
  readonly lastPeriodStart: LocalDate | undefined;
  readonly typicalCycleLength: number | undefined;
  readonly typicalPeriodLength: number | undefined;
  readonly goal: Goal;
  readonly birthYear: number | undefined;
  readonly dailyCheckInTime: LocalTime | undefined;
}

export interface OnboardingRepositories {
  readonly logRepo: Pick<LogRepo, 'putOverride'>;
  readonly settingsRepo: Pick<SettingsRepo, 'putProfile' | 'putReminder'>;
}

const ALL_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const DAILY_CHECK_IN_ID = 'onboarding-daily-check-in' as ReminderId;

export function isStandaloneDisplayMode(displayMode: boolean, iosStandalone: boolean): boolean {
  return displayMode || iosStandalone;
}

export function parseLocalDateInput(value: string, today: LocalDate): LocalDate | null {
  if (value === '') return null;
  const date = parse(value);
  if (date === null || compare(date, today) > 0) {
    throw new RangeError('Choose a valid date that is not in the future.');
  }
  return date;
}

export function parseOptionalInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === '') return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`Enter a whole number from ${minimum} to ${maximum}, or leave it blank.`);
  }
  return number;
}

export function parseReminderTime(value: string): LocalTime | undefined {
  if (value === '') return undefined;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) {
    throw new RangeError('Choose a valid local time.');
  }
  return value as LocalTime;
}

export function profileFromOnboarding(answers: OnboardingAnswers): Profile {
  return {
    ...(answers.birthYear === undefined ? {} : { birthYear: answers.birthYear }),
    ...(answers.typicalCycleLength === undefined
      ? {}
      : { typicalCycleLength: answers.typicalCycleLength }),
    ...(answers.typicalPeriodLength === undefined
      ? {}
      : { typicalPeriodLength: answers.typicalPeriodLength }),
    goal: answers.goal,
    lifeStage: 'cycle',
    units: { temp: 'celsius', weight: 'kg' },
    weekStart: 1,
    theme: 'system',
    lockTimeoutSec: 300,
    quickHideEnabled: false,
  };
}

export async function persistOwnerOnboarding(
  repositories: OnboardingRepositories,
  answers: OnboardingAnswers,
): Promise<void> {
  if (answers.lastPeriodStart !== undefined) {
    await repositories.logRepo.putOverride({
      localDate: answers.lastPeriodStart,
      kind: 'start',
    });
  }

  if (answers.dailyCheckInTime !== undefined) {
    const rule: ReminderRule = {
      id: DAILY_CHECK_IN_ID,
      kind: 'daily_symptom_log',
      localTime: answers.dailyCheckInTime,
      days: ALL_WEEKDAYS,
      condition: 'always',
      enabled: true,
    };
    await repositories.settingsRepo.putReminder(rule);
  }

  // Profile is the onboarding completion marker, so write it after the optional records.
  await repositories.settingsRepo.putProfile(profileFromOnboarding(answers));
}
