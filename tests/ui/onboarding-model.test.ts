import { describe, expect, it, vi } from 'vitest';

import type { LocalDate, LocalTime } from '../../src/contracts/localdate.ts';
import { parse } from '../../src/lib/localdate/index.ts';
import {
  isStandaloneDisplayMode,
  OPERATOR_DISCLOSURE_TEXT,
  parseLocalDateInput,
  parseOptionalInteger,
  parseReminderTime,
  persistOwnerOnboarding,
  profileFromOnboarding,
  type OnboardingAnswers,
} from '../../src/ui/screens/onboarding/model.ts';

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

const emptyAnswers: OnboardingAnswers = {
  lastPeriodStart: undefined,
  typicalCycleLength: undefined,
  typicalPeriodLength: undefined,
  goal: 'track',
  birthYear: undefined,
  contraceptionMethod: 'prefer_not_to_say',
  periodReminderEnabled: true,
  dailyCheckInTime: undefined,
};

describe('onboarding model', () => {
  it('keeps unknown cycle and period lengths absent from the Profile', () => {
    const profile = profileFromOnboarding(emptyAnswers);

    expect(profile).toEqual({
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 1,
      theme: 'system',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    });
    expect(profile).not.toHaveProperty('typicalCycleLength');
    expect(profile).not.toHaveProperty('typicalPeriodLength');
  });

  it('preserves valid health dates as LocalDate and rejects invalid or future dates', () => {
    const today = date('2026-10-31');

    expect(parseLocalDateInput('2026-10-01', today)).toBe(date('2026-10-01'));
    expect(parseLocalDateInput('', today)).toBeNull();
    expect(() => parseLocalDateInput('2026-02-29', today)).toThrow(RangeError);
    expect(() => parseLocalDateInput('2026-11-01', today)).toThrow(RangeError);
  });

  it('validates optional whole-number lengths and local reminder time', () => {
    expect(parseOptionalInteger('', 15, 90)).toBeUndefined();
    expect(parseOptionalInteger('28', 15, 90)).toBe(28);
    expect(() => parseOptionalInteger('28.5', 15, 90)).toThrow(RangeError);
    expect(() => parseOptionalInteger('14', 15, 90)).toThrow(RangeError);
    expect(parseReminderTime('08:05')).toBe('08:05');
    expect(parseReminderTime('')).toBeUndefined();
    expect(() => parseReminderTime('24:00')).toThrow(RangeError);
  });

  it('detects either standalone browser signal', () => {
    expect(isStandaloneDisplayMode(false, false)).toBe(false);
    expect(isStandaloneDisplayMode(true, false)).toBe(true);
    expect(isStandaloneDisplayMode(false, true)).toBe(true);
  });

  it('uses the same fixed operator disclosure for both roles', () => {
    expect(OPERATOR_DISCLOSURE_TEXT).toBe(
      "This app's website and its encrypted mailbox run on a free Cloudflare account held by the person who set up this private app. They can't read your encrypted data. They can see when your phone connects and roughly where from, and they could change the app's code. The mailbox is set up to keep no logs, but its owner could turn logging back on. If you'd rather hold the account yourself, that can be arranged.",
    );
  });

  it('persists the selected method and reminder choices before the Profile completion marker', async () => {
    const order: string[] = [];
    const putProfile = vi.fn(async () => {
      order.push('profile');
    });
    const putContraception = vi.fn(async () => {
      order.push('contraception');
    });
    const putReminder = vi.fn(async () => {
      order.push('reminder');
    });
    const putOverride = vi.fn(async () => {
      order.push('override');
    });

    await persistOwnerOnboarding(
      {
        settingsRepo: { putProfile, putReminder, putContraception },
        logRepo: { putOverride },
      },
      {
        ...emptyAnswers,
        lastPeriodStart: date('2026-10-01'),
        typicalCycleLength: 28,
        contraceptionMethod: 'combined_pill',
        periodReminderEnabled: true,
        dailyCheckInTime: '08:05' as LocalTime,
      },
      date('2026-10-31'),
    );

    expect(putOverride).toHaveBeenCalledWith({
      localDate: date('2026-10-01'),
      kind: 'start',
    });
    expect(putContraception).toHaveBeenCalledWith({
      method: 'combined_pill',
      startDate: date('2026-10-31'),
      regimen: { activeDays: 0, breakDays: 0, continuous: false },
    });
    expect(putReminder).toHaveBeenCalledWith({
      id: 'onboarding-period-reminder',
      kind: 'still_bleeding',
      localTime: '00:00',
      days: [1, 2, 3, 4, 5, 6, 7],
      condition: 'during_bleeding',
      enabled: true,
    });
    expect(putReminder).toHaveBeenCalledWith({
      id: 'onboarding-daily-check-in',
      kind: 'daily_symptom_log',
      localTime: '08:05',
      days: [1, 2, 3, 4, 5, 6, 7],
      condition: 'always',
      enabled: true,
    });
    expect(putProfile).toHaveBeenCalledOnce();
    expect(order).toEqual(['override', 'contraception', 'reminder', 'reminder', 'profile']);
  });

  it('persists a disabled period reminder when the user turns it off', async () => {
    const putProfile = vi.fn(async () => undefined);
    const putReminder = vi.fn(async () => undefined);
    const putContraception = vi.fn(async () => undefined);
    const putOverride = vi.fn(async () => undefined);

    await persistOwnerOnboarding(
      {
        settingsRepo: { putProfile, putReminder, putContraception },
        logRepo: { putOverride },
      },
      { ...emptyAnswers, periodReminderEnabled: false },
      date('2026-10-31'),
    );

    expect(putProfile).toHaveBeenCalledOnce();
    expect(putOverride).not.toHaveBeenCalled();
    expect(putContraception).toHaveBeenCalledOnce();
    expect(putReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'onboarding-period-reminder', enabled: false }),
    );
    expect(putReminder).toHaveBeenCalledTimes(1);
  });
});
