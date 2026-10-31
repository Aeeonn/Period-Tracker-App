import type { DayLog } from '../../../contracts/entities.ts';
import type { DueReminder } from '../../../contracts/reminders.ts';
import type { LogRepo, SettingsRepo } from '../../../contracts/store.ts';
import type { Flow } from '../../../contracts/enums.ts';
import type { LocalDate, LocalTime } from '../../../contracts/localdate.ts';
import { evaluateReminders } from '../../../reminders/inapp/index.ts';
import { runEngine } from '../../../engine/index.ts';
import { compare, diffDays, parse } from '../../../lib/localdate/index.ts';
import type { TodayScreenProps } from './today-screen.tsx';

function firstLocalDate(): LocalDate {
  const value = parse('0000-01-01');
  if (value === null) throw new Error('The LocalDate lower bound is invalid.');
  return value;
}

const FIRST_LOCAL_DATE = firstLocalDate();

export interface TodayRepositories {
  readonly logRepo: Pick<LogRepo, 'listDays' | 'listOverrides'>;
  readonly settingsRepo: Pick<
    SettingsRepo,
    'getProfile' | 'listContraception' | 'listPregnancies' | 'listReminders'
  >;
}

export interface TodayClockSnapshot {
  readonly today: LocalDate;
  readonly now: LocalTime;
}

const CONTENT_SLOT = {
  title: 'Did you know?',
  paragraphs: ['A reviewed education card will appear here when available.'],
  sourceNote: 'No reviewed education card is connected yet.',
} as const;

function displayValue(value: string): string {
  return value.replaceAll('_', ' ').replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

function loggedTodaySummary(dayLog: DayLog | undefined): readonly string[] {
  if (!dayLog) return [];
  const summary: string[] = [];
  if (dayLog.flow !== undefined) summary.push(`Flow: ${displayValue(dayLog.flow)}`);
  if (dayLog.symptoms_body !== undefined && dayLog.symptoms_body.length > 0) {
    summary.push(`Symptoms: ${[...new Set(dayLog.symptoms_body)].map(displayValue).join(', ')}`);
  }
  if (dayLog.mood !== undefined && dayLog.mood.length > 0) {
    summary.push(`Mood: ${[...new Set(dayLog.mood)].map(displayValue).join(', ')}`);
  }
  if (dayLog.energy !== undefined) summary.push(`Energy: ${dayLog.energy}`);
  return [...new Set(summary)];
}

function latestPeriodStart(
  engineOutput: ReturnType<typeof runEngine>,
  today: LocalDate,
): LocalDate | null {
  let latest: LocalDate | null = null;
  for (const episode of engineOutput.episodes) {
    if (episode.kind !== 'period' || compare(episode.start, today) > 0) continue;
    if (latest === null || compare(episode.start, latest) > 0) latest = episode.start;
  }
  return latest;
}

export function createTodayScreenProps(
  repositories: TodayRepositories,
  clock: TodayClockSnapshot,
): Promise<TodayScreenProps> {
  return loadTodayScreenProps(repositories, clock);
}

async function loadTodayScreenProps(
  { logRepo, settingsRepo }: TodayRepositories,
  { today, now }: TodayClockSnapshot,
): Promise<TodayScreenProps> {
  const [profile, contraception, pregnancies, overrides, reminderRules, dayBundles] =
    await Promise.all([
      settingsRepo.getProfile(),
      settingsRepo.listContraception(),
      settingsRepo.listPregnancies(),
      logRepo.listOverrides(),
      settingsRepo.listReminders(),
      logRepo.listDays({ start: FIRST_LOCAL_DATE, end: today }),
    ]);
  const dayLogs: readonly DayLog[] = dayBundles;
  const engineProfile = {
    ...(profile?.birthYear === undefined ? {} : { birthYear: profile.birthYear }),
    ...(profile?.typicalCycleLength === undefined
      ? {}
      : { typicalCycleLength: profile.typicalCycleLength }),
    ...(profile?.typicalPeriodLength === undefined
      ? {}
      : { typicalPeriodLength: profile.typicalPeriodLength }),
    lifeStage: profile?.lifeStage ?? 'cycle',
    contraception,
  } satisfies Parameters<typeof runEngine>[0]['profile'];
  const engineOutput = runEngine({
    today,
    profile: engineProfile,
    dayLogs,
    episodesOverride: overrides,
    pregnancies,
    coupleEntriesAllowedForInsights: [],
  });
  const latestStart = latestPeriodStart(engineOutput, today);
  const cycleDay = latestStart === null ? null : diffDays(latestStart, today) + 1;
  const todayLog = dayLogs.find((dayLog) => dayLog.localDate === today);
  const currentEpisode = engineOutput.episodes.some(
    (episode) =>
      episode.kind === 'period' &&
      compare(episode.start, today) <= 0 &&
      compare(today, episode.end) <= 0,
  );
  const reminders: readonly DueReminder[] = evaluateReminders({
    today,
    now,
    rules: reminderRules,
    engineOutput,
    recentDayLogs: todayLog === undefined ? [] : [todayLog],
  });

  return {
    engineOutput,
    today,
    cycleDay,
    stillBleeding: currentEpisode && todayLog?.flow !== 'none',
    contentSlot: CONTENT_SLOT,
    loggedToday: loggedTodaySummary(todayLog),
    ...(todayLog?.flow === undefined ? {} : { flowToday: todayLog.flow as Flow }),
    reminders,
  };
}
