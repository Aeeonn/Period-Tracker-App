import type { ContentCardId } from '../../../contracts/brand.ts';
import type { ContentCard } from '../../../contracts/content.ts';
import type { DayLog, Profile } from '../../../contracts/entities.ts';
import type { DueReminder } from '../../../contracts/reminders.ts';
import type { LogRepo, SettingsRepo } from '../../../contracts/store.ts';
import type {
  CyclePhase,
  Flow,
  IsoWeekday,
  LifeStage,
  SymptomBody,
} from '../../../contracts/enums.ts';
import type { LocalDate, LocalTime } from '../../../contracts/localdate.ts';
import { evaluateReminders } from '../../../reminders/inapp/index.ts';
import { runEngine } from '../../../engine/index.ts';
import { compare, diffDays, parse } from '../../../lib/localdate/index.ts';
import { contentIndex } from '../../../content/index.ts';
import type { TodayScreenProps } from './today-screen.tsx';

export type EngineRunner = (
  input: Parameters<typeof runEngine>[0],
) => Promise<ReturnType<typeof runEngine>>;

const runEngineLocally: EngineRunner = async (input) => runEngine(input);

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

const CONTENT_RECENCY_DAYS = 14;

const EMPTY_CONTENT_SLOT = {
  title: 'Did you know?',
  cardTitle: null,
  paragraphs: [],
  sources: [],
} as const;

function recentSymptoms(dayLogs: readonly DayLog[], today: LocalDate): readonly SymptomBody[] {
  const symptoms = new Set<SymptomBody>();
  for (const dayLog of dayLogs) {
    const ageDays = diffDays(dayLog.localDate, today);
    if (ageDays < 0 || ageDays >= 3) continue;
    for (const symptom of dayLog.symptoms_body ?? []) symptoms.add(symptom);
  }
  return [...symptoms];
}

function recentCardIds(
  history: Profile['recentContentCards'],
  today: LocalDate,
): readonly ContentCardId[] {
  return [
    ...new Set(
      (history ?? [])
        .filter((entry) => {
          const ageDays = diffDays(entry.shownOn, today);
          return ageDays >= 0 && ageDays < CONTENT_RECENCY_DAYS;
        })
        .map((entry) => entry.cardId),
    ),
  ];
}

function contentPhase(
  engineOutput: ReturnType<typeof runEngine>,
  currentEpisode: boolean,
  today: LocalDate,
): CyclePhase | null {
  if (currentEpisode) return 'period';
  const fertility = engineOutput.fertility;
  if (
    fertility.kind === 'fertility' &&
    compare(today, fertility.possibleBand.start) >= 0 &&
    compare(today, fertility.possibleBand.end) <= 0
  ) {
    return 'fertile';
  }
  return null;
}

function selectTodayCard(
  profile: Profile | undefined,
  today: LocalDate,
  lifeStage: LifeStage,
  engineOutput: ReturnType<typeof runEngine>,
  currentEpisode: boolean,
  dayLogs: readonly DayLog[],
  refreshContent: boolean,
): ContentCard | undefined {
  const history = profile?.recentContentCards ?? [];
  if (!refreshContent) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry?.shownOn !== today) continue;
      const existing = contentIndex.get(entry.cardId);
      if (existing?.modes.includes(lifeStage) && existing.sources.length > 0) return existing;
      break;
    }
  }

  const selection = contentIndex.select({
    today,
    lifeStage,
    currentPhase: contentPhase(engineOutput, currentEpisode, today),
    recentSymptoms: recentSymptoms(dayLogs, today),
    recentlyShown: recentCardIds(history, today),
  });
  return selection ? contentIndex.get(selection.cardId) : undefined;
}

export async function rememberTodayContentCard(
  settingsRepo: Pick<SettingsRepo, 'getProfile' | 'putProfile'>,
  cardId: ContentCardId,
  shownOn: LocalDate,
): Promise<void> {
  const profile = await settingsRepo.getProfile();
  if (profile === undefined) return;

  const history = (profile.recentContentCards ?? []).filter((entry) => {
    const ageDays = diffDays(entry.shownOn, shownOn);
    return ageDays >= 0 && ageDays < CONTENT_RECENCY_DAYS;
  });
  if (history.some((entry) => entry.cardId === cardId && entry.shownOn === shownOn)) return;

  await settingsRepo.putProfile({
    ...profile,
    recentContentCards: [...history, { cardId, shownOn }],
  });
}

function displayValue(value: string): string {
  return value.replaceAll('_', ' ').replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

const ENERGY_LABELS = ['Drained', 'Low', 'OK', 'Energised'] as const;

function loggedTodaySummary(dayLog: DayLog | undefined): readonly string[] {
  if (!dayLog) return [];
  const summary: string[] = [];
  if (dayLog.flow !== undefined) summary.push(`Flow: ${displayValue(dayLog.flow)}`);
  if (dayLog.heavy_detail !== undefined && dayLog.heavy_detail.length > 0) {
    summary.push(
      `Heavy-flow details: ${[...new Set(dayLog.heavy_detail)].map(displayValue).join(', ')}`,
    );
  }
  if (dayLog.period_pain !== undefined) {
    summary.push(`Period pain: ${displayValue(dayLog.period_pain)}`);
  }
  if (dayLog.discharge !== undefined) {
    summary.push(`Discharge: ${displayValue(dayLog.discharge)}`);
  }
  if (dayLog.symptoms_body !== undefined && dayLog.symptoms_body.length > 0) {
    summary.push(`Symptoms: ${[...new Set(dayLog.symptoms_body)].map(displayValue).join(', ')}`);
  }
  if (dayLog.mood !== undefined && dayLog.mood.length > 0) {
    summary.push(`Mood: ${[...new Set(dayLog.mood)].map(displayValue).join(', ')}`);
  }
  if (dayLog.energy !== undefined) {
    summary.push(`Energy: ${ENERGY_LABELS[dayLog.energy] ?? 'Logged'}`);
  }
  if (dayLog.stress !== undefined) summary.push('Stress logged');
  if (dayLog.desire !== undefined) summary.push('Desire logged');
  if (dayLog.sex !== undefined && dayLog.sex.length > 0) summary.push('Intimacy logged');
  if (dayLog.tests !== undefined) summary.push('Tests logged');
  if (dayLog.bbt !== undefined) summary.push('Temperature logged');
  if (dayLog.ovulation_manual !== undefined) {
    summary.push(`Ovulation: ${displayValue(dayLog.ovulation_manual)}`);
  }
  if (dayLog.pill_intake !== undefined) {
    summary.push(`Pill intake: ${displayValue(dayLog.pill_intake)}`);
  }
  if (dayLog.medication !== undefined && dayLog.medication.length > 0) {
    summary.push('Medication logged');
  }
  if (dayLog.weight !== undefined) summary.push('Weight logged');
  if (dayLog.water !== undefined) summary.push('Water logged');
  if (dayLog.sleep !== undefined) summary.push('Sleep logged');
  if (dayLog.activity !== undefined) summary.push('Activity logged');
  if (dayLog.alcohol !== undefined) summary.push('Alcohol logged');
  if (dayLog.notes !== undefined && dayLog.notes.trim().length > 0) summary.push('Note added');
  if (dayLog.peri_impact !== undefined) summary.push('Perimenopause impacts logged');
  if (dayLog.lochia !== undefined) {
    summary.push(`Postpartum bleeding: ${displayValue(dayLog.lochia)}`);
  }
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
  engineRunner: EngineRunner = runEngineLocally,
  options: { readonly refreshContent?: boolean } = {},
): Promise<TodayScreenProps> {
  return loadTodayScreenProps(repositories, clock, engineRunner, options.refreshContent === true);
}

async function loadTodayScreenProps(
  { logRepo, settingsRepo }: TodayRepositories,
  { today, now }: TodayClockSnapshot,
  engineRunner: EngineRunner,
  refreshContent: boolean,
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
  const engineInput = {
    today,
    profile: engineProfile,
    dayLogs,
    episodesOverride: overrides,
    pregnancies,
    coupleEntriesAllowedForInsights: [],
  } satisfies Parameters<typeof runEngine>[0];
  const engineOutput = await engineRunner(engineInput);
  const latestStart = latestPeriodStart(engineOutput, today);
  const cycleDay = latestStart === null ? null : diffDays(latestStart, today) + 1;
  const todayLog = dayLogs.find((dayLog) => dayLog.localDate === today);
  const currentEpisode = engineOutput.episodes.some(
    (episode) =>
      episode.kind === 'period' &&
      compare(episode.start, today) <= 0 &&
      compare(today, episode.end) <= 0,
  );
  const selectedCard = selectTodayCard(
    profile,
    today,
    engineProfile.lifeStage,
    engineOutput,
    currentEpisode,
    dayLogs,
    refreshContent,
  );
  const contentSlot = selectedCard
    ? {
        title: 'Did you know?',
        cardId: selectedCard.id,
        cardTitle: selectedCard.title,
        paragraphs: selectedCard.body,
        sources: selectedCard.sources,
      }
    : EMPTY_CONTENT_SLOT;
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
    contentSlot,
    loggedToday: loggedTodaySummary(todayLog),
    weekStart: profile?.weekStart ?? (1 as IsoWeekday),
    ...(todayLog?.flow === undefined ? {} : { flowToday: todayLog.flow as Flow }),
    reminders,
  };
}
