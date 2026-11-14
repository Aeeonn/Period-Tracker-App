import { describe, expect, it } from 'vitest';
import type { ReminderId } from '../../../../src/contracts/brand.ts';
import type {
  DayBundle,
  DayLog,
  Profile,
  ReminderRule,
} from '../../../../src/contracts/entities.ts';
import type { LocalDate, LocalTime } from '../../../../src/contracts/localdate.ts';
import type { SettingsRepo } from '../../../../src/contracts/store.ts';
import { contentCardId } from '../../../../src/content/cards/core/types.ts';
import {
  createTodayScreenProps,
  rememberTodayContentCard,
} from '../../../../src/ui/screens/today/live-data.ts';
import { addDays, parse } from '../../../../src/lib/localdate/index.ts';

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function day(localDate: string | LocalDate, values: Partial<DayLog> = {}): DayBundle {
  return {
    ...values,
    localDate: typeof localDate === 'string' ? date(localDate) : localDate,
    fieldHlc: {},
  };
}

function repositories(
  days: readonly DayBundle[],
  rules: readonly ReminderRule[] = [],
  profile: Profile | undefined = undefined,
) {
  return {
    logRepo: {
      async listDays(range: { start: LocalDate; end: LocalDate }) {
        return days.filter((item) => item.localDate >= range.start && item.localDate <= range.end);
      },
      async listOverrides() {
        return [];
      },
    },
    settingsRepo: {
      async getProfile() {
        return profile;
      },
      async listContraception() {
        return [];
      },
      async listPregnancies() {
        return [];
      },
      async listReminders() {
        return rules;
      },
    },
  };
}

const clock = { today: date('2026-04-02'), now: '09:00' as LocalTime };

describe('live Today data', () => {
  it('shows an engine no-data state without inventing predictions for an empty repository', async () => {
    const result = await createTodayScreenProps(repositories([]), clock);

    expect(result.engineOutput.prediction).toEqual({ kind: 'suppressed', reason: 'no_data' });
    expect(result.cycleDay).toBeNull();
    expect(result.stillBleeding).toBe(false);
    expect(result.loggedToday).toEqual([]);
    expect(result.reminders).toEqual([]);
  });

  it('does not make a prediction from non-period logs alone', async () => {
    const result = await createTodayScreenProps(
      repositories([day('2026-04-02', { symptoms_body: ['cramps'] })]),
      clock,
    );

    expect(result.engineOutput.prediction).toEqual({ kind: 'suppressed', reason: 'no_data' });
    expect(result.cycleDay).toBeNull();
    expect(result.loggedToday).toEqual(['Symptoms: Cramps']);
  });

  it('deduplicates values and keeps one summary entry per tracker', async () => {
    const result = await createTodayScreenProps(
      repositories([
        day('2026-04-02', {
          flow: 'medium',
          symptoms_body: ['cramps', 'cramps', 'fatigue'],
          mood: ['calm', 'calm'],
        }),
      ]),
      clock,
    );

    expect(result.loggedToday).toEqual(['Flow: Medium', 'Symptoms: Cramps, Fatigue', 'Mood: Calm']);
    expect(result.flowToday).toBe('medium');
  });

  it('summarizes every logged tracker without exposing private tracker values', async () => {
    const result = await createTodayScreenProps(
      repositories([
        day('2026-04-02', {
          flow: 'medium',
          heavy_detail: ['flooding'],
          period_pain: 'moderate',
          discharge: 'creamy',
          symptoms_body: ['cramps'],
          mood: ['calm'],
          energy: 3,
          stress: 1,
          desire: 'high',
          sex: [{ activity: ['vaginal'], protection: [] }],
          tests: { pregnancy: 'negative' },
          bbt: { valueC: 36.55, measuredAt: '06:30' as LocalTime, disturbances: [] },
          ovulation_manual: 'yes',
          pill_intake: 'late',
          medication: [{ name: 'Synthetic medication', taken: true }],
          weight: 61.2,
          water: 1400,
          sleep: { hours: 7.5, quality: 2 },
          activity: { minutes: 35, type: 'walk' },
          alcohol: 0,
          notes: 'Synthetic private note',
          peri_impact: {
            hot_flushes: 1,
            night_sweats: 2,
            sleep: 3,
            mood: 0,
            anxiety: 1,
            joint_aches: 2,
            concentration: 1,
            vaginal_dryness: 0,
            libido_change: 2,
            fatigue: 3,
          },
          lochia: 'moderate',
        }),
      ]),
      clock,
    );

    expect(result.loggedToday).toEqual([
      'Flow: Medium',
      'Heavy-flow details: Flooding',
      'Period pain: Moderate',
      'Discharge: Creamy',
      'Symptoms: Cramps',
      'Mood: Calm',
      'Energy: Energised',
      'Stress logged',
      'Desire logged',
      'Intimacy logged',
      'Tests logged',
      'Temperature logged',
      'Ovulation: Yes',
      'Pill intake: Late',
      'Medication logged',
      'Weight logged',
      'Water logged',
      'Sleep logged',
      'Activity logged',
      'Alcohol logged',
      'Note added',
      'Perimenopause impacts logged',
      'Postpartum bleeding: Moderate',
    ]);
    expect(result.loggedToday.join(' ')).not.toContain('Synthetic private note');
    expect(result.loggedToday.join(' ')).not.toContain('vaginal');
  });

  it('passes the saved ISO week-start preference through to Today', async () => {
    const sundayFirstProfile: Profile = {
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 7,
      theme: 'system',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    };
    const result = await createTodayScreenProps(repositories([], [], sundayFirstProfile), clock);

    expect(result.weekStart).toBe(7);
  });

  it('computes the current cycle and reminder banner inputs from repository data', async () => {
    const periodDays = ['2026-02-01', '2026-03-01', '2026-03-29'].flatMap((start) =>
      Array.from({ length: 5 }, (_, offset) =>
        day(addDays(date(start), offset), { flow: 'medium' }),
      ),
    );
    const todayLog = day('2026-04-02', { flow: 'medium', symptoms_body: ['cramps'] });
    const rule: ReminderRule = {
      id: 'synthetic-check-in-rule' as ReminderId,
      kind: 'custom',
      localTime: '08:00' as LocalTime,
      days: [4],
      condition: 'always',
      enabled: true,
    };
    const result = await createTodayScreenProps(
      repositories(
        [...periodDays.filter((item) => item.localDate !== clock.today), todayLog],
        [rule],
      ),
      clock,
    );

    expect(result.engineOutput.prediction.kind).toBe('prediction');
    expect(result.cycleDay).toBe(5);
    expect(result.stillBleeding).toBe(true);
    expect(result.loggedToday).toEqual(['Flow: Medium', 'Symptoms: Cramps']);
    expect(result.reminders).toEqual([{ ruleId: rule.id, kind: 'custom' }]);
  });

  it('selects a sourced card from recent symptoms and phase, while respecting the 14-day history', async () => {
    const profile: Profile = {
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 1,
      theme: 'light',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    };
    const periodDays = Array.from({ length: 4 }, (_, offset) =>
      day(addDays(date('2026-03-29'), offset), { flow: 'medium' }),
    );
    const currentLog = day(clock.today, { flow: 'medium', symptoms_body: ['cramps'] });
    const todayRepositories = repositories([...periodDays, currentLog], [], profile);

    const selected = await createTodayScreenProps(todayRepositories, clock);
    expect(selected.contentSlot.cardId).toBe(contentCardId('period-pain-when-to-get-help'));
    expect(selected.contentSlot.cardTitle).toBe('When period pain needs attention');
    expect(selected.contentSlot.sources[0]).toMatchObject({
      publisher: 'National Health Service (NHS)',
      title: 'Period pain (reviewed 18 March 2026)',
    });

    const recentlyShownProfile: Profile = {
      ...profile,
      recentContentCards: [
        {
          cardId: contentCardId('period-pain-when-to-get-help'),
          shownOn: addDays(clock.today, -1),
        },
      ],
    };
    const afterRepeatSuppression = await createTodayScreenProps(
      repositories([...periodDays, currentLog], [], recentlyShownProfile),
      clock,
    );
    expect(afterRepeatSuppression.contentSlot.cardId).not.toBe(
      contentCardId('period-pain-when-to-get-help'),
    );

    const shownTodayProfile: Profile = {
      ...profile,
      recentContentCards: [{ cardId: contentCardId('cycle-basics'), shownOn: clock.today }],
    };
    const stableTodayCard = await createTodayScreenProps(
      repositories([...periodDays, currentLog], [], shownTodayProfile),
      clock,
    );
    expect(stableTodayCard.contentSlot.cardId).toBe(contentCardId('cycle-basics'));

    const refreshedCard = await createTodayScreenProps(
      repositories([...periodDays, currentLog], [], shownTodayProfile),
      clock,
      undefined,
      { refreshContent: true },
    );
    expect(refreshedCard.contentSlot.cardId).not.toBe(contentCardId('cycle-basics'));
  });

  it('keeps only the recent 14-day card history when recording a displayed card', async () => {
    let profile: Profile | undefined = {
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 1,
      theme: 'light',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
      recentContentCards: [
        { cardId: contentCardId('cycle-basics'), shownOn: addDays(clock.today, -1) },
        { cardId: contentCardId('fertile-window-uncertainty'), shownOn: addDays(clock.today, -15) },
      ],
    };
    let writes = 0;
    const settingsRepo: Pick<SettingsRepo, 'getProfile' | 'putProfile'> = {
      async getProfile() {
        return profile;
      },
      async putProfile(nextProfile) {
        writes += 1;
        profile = nextProfile;
      },
    };

    await rememberTodayContentCard(
      settingsRepo,
      contentCardId('how-predictions-work'),
      clock.today,
    );
    expect(profile?.recentContentCards).toEqual([
      { cardId: contentCardId('cycle-basics'), shownOn: addDays(clock.today, -1) },
      { cardId: contentCardId('how-predictions-work'), shownOn: clock.today },
    ]);

    await rememberTodayContentCard(
      settingsRepo,
      contentCardId('how-predictions-work'),
      clock.today,
    );
    expect(writes).toBe(1);
  });
});
