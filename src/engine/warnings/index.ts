import type { CycleStat, EngineInput, Episode, WarningCard } from '../../contracts/engine-api.ts';
import type { DayLog } from '../../contracts/entities.ts';
import type { LocalDate } from '../../contracts/localdate.ts';
import type { WarningRuleId, WarningSeverity } from '../../contracts/enums.ts';
import { addDays, compare, diffDays, parse } from '../../lib/localdate/index.ts';

type InScopeRuleId = 'W-01' | 'W-02' | 'W-03' | 'W-04' | 'W-05' | 'W-06' | 'W-07' | 'W-11';

type WarningSourceId =
  | 'ACOG_ABNORMAL_BLEEDING'
  | 'NHS_HEAVY_PERIODS'
  | 'NICE_NG88'
  | 'FIGO_AUB_SYSTEMS_2023'
  | 'PCOS_INTERNATIONAL_GUIDELINE_2023'
  | 'CANADA_988'
  | 'CANADA_988_ABOUT'
  | 'CANADA_MENTAL_HEALTH';

/** A11 metadata added without changing the existing EngineOutput/Today card contract. */
export interface A11Warning extends WarningCard {
  readonly sourceIds: readonly WarningSourceId[];
}

const WARNING_SOURCE_IDS: Readonly<Record<InScopeRuleId, readonly WarningSourceId[]>> = {
  'W-01': ['ACOG_ABNORMAL_BLEEDING'],
  'W-02': ['NHS_HEAVY_PERIODS', 'NICE_NG88'],
  'W-03': ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
  'W-04': ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
  'W-05': ['FIGO_AUB_SYSTEMS_2023'],
  'W-06': ['PCOS_INTERNATIONAL_GUIDELINE_2023', 'ACOG_ABNORMAL_BLEEDING'],
  'W-07': ['ACOG_ABNORMAL_BLEEDING'],
  'W-11': ['CANADA_988', 'CANADA_988_ABOUT', 'CANADA_MENTAL_HEALTH'],
};

const PERIOD_FLOWS: ReadonlySet<NonNullable<DayLog['flow']>> = new Set([
  'light',
  'medium',
  'heavy',
  'very_heavy',
]);
const W01_SYMPTOMS = new Set(['chest_pain', 'breathlessness', 'dizziness']);
const W02_ITEMS = new Set([
  'change_every_1_2h',
  'soaking_hourly_over_2h',
  'clots_over_2_5cm',
  'flooding',
  'stops_daily_activities',
]);
const HORMONAL_METHODS = new Set([
  'combined_pill',
  'progestogen_only_pill',
  'patch',
  'ring',
  'hormonal_iud',
  'implant',
  'injection',
]);

// Product default, changeable by the captain: evidence through age 183 days inclusive counts.
const WARNING_EVIDENCE_WINDOW_DAYS = 183;

function uniqueSortedDates(dates: readonly LocalDate[]): LocalDate[] {
  return [...new Set(dates)].sort(compare);
}

function makeWarning(
  ruleId: InScopeRuleId,
  severity: WarningSeverity,
  scopeStart: LocalDate,
  evidenceDates: readonly LocalDate[],
): A11Warning {
  // A11's shared dismissal rule: emergencies (including W-11) remain non-dismissible while active.
  return {
    ruleId,
    severity,
    dismissible: ruleId !== 'W-11' && severity !== 'EMERGENCY',
    scopeStart,
    evidenceDates: uniqueSortedDates(evidenceDates),
    sourceIds: WARNING_SOURCE_IDS[ruleId],
  };
}

function orderedLogs(input: EngineInput): DayLog[] {
  return input.dayLogs
    .filter((log) => compare(log.localDate, input.today) <= 0)
    .slice()
    .sort((left, right) => compare(left.localDate, right.localDate));
}

function isRecentWarningEvidence(date: LocalDate, today: LocalDate): boolean {
  const ageDays = diffDays(date, today);
  return ageDays >= 0 && ageDays <= WARNING_EVIDENCE_WINDOW_DAYS;
}

function orderedEpisodes(episodes: readonly Episode[]): Episode[] {
  return episodes.slice().sort((left, right) => compare(left.start, right.start));
}

function isPeriodFlow(flow: DayLog['flow']): boolean {
  return flow !== undefined && PERIOD_FLOWS.has(flow);
}

function episodeContainsDate(episode: Episode, date: LocalDate): boolean {
  return (
    (compare(date, episode.start) >= 0 && compare(date, episode.end) <= 0) ||
    episode.assumedDays.includes(date)
  );
}

function cycleAnchorForDate(
  date: LocalDate,
  cycleEpisodes: readonly Episode[],
): LocalDate | undefined {
  const previous = cycleEpisodes.filter((episode) => compare(episode.start, date) <= 0).at(-1);
  return previous?.start;
}

function w01ConditionDays(logs: readonly DayLog[]): LocalDate[] {
  // A11 W-01: the hourly-soaking item and at least one named symptom must share one logged day.
  return logs
    .filter(
      (log) =>
        log.heavy_detail?.includes('soaking_hourly_over_2h') === true &&
        (log.symptoms_body ?? []).some((symptom) => W01_SYMPTOMS.has(symptom)),
    )
    .map((log) => log.localDate);
}

function activeW01Evidence(evidenceDates: readonly LocalDate[], today: LocalDate): LocalDate[] {
  const yesterday = addDays(today, -1);
  // Captain decision 2026-10-30: W-01 is active only for evidence logged today or yesterday.
  return evidenceDates.filter((date) => date === today || date === yesterday);
}

function activeW02Items(log: DayLog, w01Days: ReadonlySet<LocalDate>): readonly string[] {
  const items = (log.heavy_detail ?? []).filter((item) => W02_ITEMS.has(item));
  // A11 W-02: hourly soaking is a W-02 item only without the W-01 symptoms on that day.
  return items.filter((item) => item !== 'soaking_hourly_over_2h' || !w01Days.has(log.localDate));
}

function w02Warning(
  logs: readonly DayLog[],
  periodEpisodes: readonly Episode[],
  w01Days: ReadonlySet<LocalDate>,
  today: LocalDate,
): A11Warning | undefined {
  // A11 W-02: heavy-detail items are restricted to the latest current period episode.
  const current = periodEpisodes.at(-1);
  if (current === undefined) return undefined;
  const recentLogs = logs.filter((log) => isRecentWarningEvidence(log.localDate, today));
  const itemDates = recentLogs.flatMap((log) => {
    if (!episodeContainsDate(current, log.localDate)) return [];
    return activeW02Items(log, w01Days).length > 0 ? [log.localDate] : [];
  });
  const dates = uniqueSortedDates(itemDates);
  if (dates.length === 0) return undefined;

  const uniqueItems = new Set(
    recentLogs
      .filter((log) => dates.includes(log.localDate))
      .flatMap((log) => activeW02Items(log, w01Days)),
  );
  // A11 W-02: exactly one item on one day is DISCUSS; every other non-empty case seeks advice soon.
  const severity: WarningSeverity =
    uniqueItems.size === 1 && dates.length === 1 ? 'DISCUSS' : 'SEEK_ADVICE_SOON';
  return makeWarning('W-02', severity, current.start, dates);
}

function w03Warning(
  logs: readonly DayLog[],
  periodEpisodes: readonly Episode[],
): A11Warning | undefined {
  // A11 W-03: inspect the last six period episodes; more than seven bleeding days is the trigger.
  const recent = periodEpisodes.slice(-6);
  const longPeriods = recent.filter((episode) => episode.bleedingDays > 7);
  if (longPeriods.length === 0) return undefined;
  // A11 W-03: one long period is INFO; two or more of the last six are DISCUSS.
  const severity: WarningSeverity = longPeriods.length >= 2 ? 'DISCUSS' : 'INFO';
  const evidence = longPeriods.flatMap((episode) => [
    episode.start,
    ...logs
      .filter(
        (log) =>
          isPeriodFlow(log.flow) &&
          compare(log.localDate, episode.start) >= 0 &&
          compare(log.localDate, episode.end) <= 0,
      )
      .map((log) => log.localDate),
  ]);
  const latestPeriod = periodEpisodes.at(-1);
  return makeWarning('W-03', severity, latestPeriod?.start ?? longPeriods.at(-1)!.start, evidence);
}

function w04Warning(
  cycles: readonly CycleStat[],
  periodEpisodes: readonly Episode[],
): A11Warning | undefined {
  // A11 W-04: only valid cycle lengths are considered; the ACOG 21-35 range is strict.
  const recentValid = cycles.filter((cycle) => cycle.excludedBecause === undefined).slice(-6);
  const irregular = recentValid.filter((cycle) => cycle.length < 21 || cycle.length > 35);
  if (irregular.length === 0) return undefined;
  // A11 W-04: one out-of-range cycle is INFO; two or more of the last six are DISCUSS.
  const severity: WarningSeverity = irregular.length >= 2 ? 'DISCUSS' : 'INFO';
  const evidence = irregular.flatMap((cycle) => [cycle.start, cycle.nextStart]);
  const latestPeriod = periodEpisodes.at(-1);
  return makeWarning('W-04', severity, latestPeriod?.start ?? irregular.at(-1)!.start, evidence);
}

function addCalendarMonths(date: LocalDate, months: number): LocalDate {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const leap = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
  const daysInMonth =
    targetMonth === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(targetMonth) ? 30 : 31;
  const targetDay = Math.min(day, daysInMonth);
  const result = parse(
    `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`,
  );
  if (result === null)
    throw new RangeError('Calendar-month arithmetic produced an invalid LocalDate');
  return result;
}

function w05Warning(
  input: EngineInput,
  cycles: readonly CycleStat[],
  periodEpisodes: readonly Episode[],
): A11Warning | undefined {
  // A11 W-05: the six-month sample uses valid cycles whose starts fall in the calendar-month window.
  const windowStart = addCalendarMonths(input.today, -6);
  const recent = cycles.filter(
    (cycle) => cycle.excludedBecause === undefined && compare(cycle.start, windowStart) >= 0,
  );
  if (recent.length < 2) return undefined;
  const lengths = recent.map((cycle) => cycle.length);
  const spread = Math.max(...lengths) - Math.min(...lengths);
  // A11/R3 W-05: unknown/18-25 and 42-45 use >9; 26-41 uses >7.
  const age =
    input.profile.birthYear === undefined
      ? undefined
      : Number(input.today.slice(0, 4)) - input.profile.birthYear;
  const threshold =
    age === undefined || (age >= 18 && age <= 25) || (age >= 42 && age <= 45)
      ? 9
      : age >= 26 && age <= 41
        ? 7
        : undefined;
  if (threshold === undefined || spread <= threshold) return undefined;

  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const extrema = recent.filter(
    (cycle) => cycle.length === minLength || cycle.length === maxLength,
  );
  const evidence = extrema.flatMap((cycle) => [cycle.start, cycle.nextStart]);
  const latestPeriod = periodEpisodes.at(-1);
  return makeWarning('W-05', 'INFO', latestPeriod?.start ?? extrema.at(-1)!.start, evidence);
}

function hasActiveContinuousHormonalMethod(input: EngineInput, date: LocalDate): boolean {
  return input.profile.contraception.some(
    (state) =>
      HORMONAL_METHODS.has(state.method) &&
      state.regimen.continuous &&
      compare(state.startDate, date) <= 0 &&
      (state.endDate === undefined || compare(date, state.endDate) <= 0),
  );
}

function w06Warning(input: EngineInput, episodes: readonly Episode[]): A11Warning | undefined {
  // A11 W-06 and the approved pregnancy/postpartum deferral: do not show this rule in those modes.
  if (input.profile.lifeStage === 'pregnancy' || input.profile.lifeStage === 'postpartum') {
    return undefined;
  }
  if (hasActiveContinuousHormonalMethod(input, input.today)) return undefined;
  const lastBleedingEpisode = episodes
    .filter((episode) => episode.kind !== 'postpartum_lochia')
    .slice()
    .sort((left, right) => compare(left.start, right.start))
    .at(-1);
  if (lastBleedingEpisode === undefined) return undefined;
  // A11 W-06: >90 days means today - last start is at least 91 LocalDate days.
  if (diffDays(lastBleedingEpisode.start, input.today) < 91) return undefined;
  return makeWarning('W-06', 'SEEK_ADVICE_SOON', lastBleedingEpisode.start, [
    lastBleedingEpisode.start,
  ]);
}

function hormonalMethodWithinFirstThreeMonths(input: EngineInput, date: LocalDate): boolean {
  // A11 W-07: the first-three-month exception is a calendar-month interval from a hormonal method start.
  return input.profile.contraception.some((state) => {
    if (!HORMONAL_METHODS.has(state.method)) return false;
    if (compare(state.startDate, date) > 0) return false;
    const threeMonthAnniversary = addCalendarMonths(state.startDate, 3);
    if (compare(date, threeMonthAnniversary) >= 0) return false;
    return state.endDate === undefined || compare(date, state.endDate) <= 0;
  });
}

function intermenstrualEvents(
  logs: readonly DayLog[],
  cycleEpisodes: readonly Episode[],
  lochiaEpisodes: readonly Episode[],
): readonly { readonly date: LocalDate; readonly cycleStart: LocalDate }[] {
  // A1 labels lochia as a separate episode, never a period; neither its flow nor attached spotting is intermenstrual.
  const events: { readonly date: LocalDate; readonly cycleStart: LocalDate }[] = [];
  for (const log of logs) {
    if (log.flow === undefined || log.flow === 'none') continue;
    const belongsToCycleEpisode = cycleEpisodes.some(
      (episode) =>
        episodeContainsDate(episode, log.localDate) || episode.spottingDays.includes(log.localDate),
    );
    const belongsToLochiaEpisode = lochiaEpisodes.some(
      (episode) =>
        episodeContainsDate(episode, log.localDate) || episode.spottingDays.includes(log.localDate),
    );
    if (belongsToCycleEpisode || belongsToLochiaEpisode) continue;
    const cycleStart = cycleAnchorForDate(log.localDate, cycleEpisodes);
    if (cycleStart !== undefined) events.push({ date: log.localDate, cycleStart });
  }
  return events;
}

function w07Warning(
  input: EngineInput,
  logs: readonly DayLog[],
  cycleEpisodes: readonly Episode[],
  lochiaEpisodes: readonly Episode[],
): A11Warning | undefined {
  const recentLogs = logs.filter((log) => isRecentWarningEvidence(log.localDate, input.today));
  // A11 W-07(a): any recent logged sex entry with bleeding_after=yes triggers DISCUSS.
  const sexBleedingDates = recentLogs
    .filter((log) => log.sex?.some((entry) => entry.bleeding_after === 'yes') === true)
    .map((log) => log.localDate);
  // A11 W-07(b): count recent distinct cycles containing unassigned flow/spotting.
  const spotting = intermenstrualEvents(recentLogs, cycleEpisodes, lochiaEpisodes);
  if (sexBleedingDates.length === 0 && spotting.length === 0) return undefined;

  const spottingOutsideMethodWindow = spotting.filter(
    (event) => !hormonalMethodWithinFirstThreeMonths(input, event.date),
  );
  const spottingCycles = new Set(spottingOutsideMethodWindow.map((event) => event.cycleStart));
  // The method exception applies only to evidence inside that method's first-three-month window.
  const spottingSeverity: WarningSeverity = spottingCycles.size >= 2 ? 'DISCUSS' : 'INFO';
  // A11 W-07(a) DISCUSS remains stronger than the W-07(b) method-window INFO override.
  const severity: WarningSeverity =
    sexBleedingDates.length > 0 || spottingSeverity === 'DISCUSS' ? 'DISCUSS' : 'INFO';
  const evidenceDates = [...sexBleedingDates, ...spotting.map((event) => event.date)];
  const cycleStart = cycleAnchorForDate(uniqueSortedDates(evidenceDates).at(-1)!, cycleEpisodes);
  return makeWarning(
    'W-07',
    severity,
    cycleStart ?? uniqueSortedDates(evidenceDates).at(-1)!,
    evidenceDates,
  );
}

function w11Warning(input: EngineInput, logs: readonly DayLog[]): A11Warning | undefined {
  // A11 W-11: a self-harm-thought mood log today or yesterday shows the local crisis support card.
  const yesterday = addDays(input.today, -1);
  const evidenceDates = logs
    .filter(
      (log) =>
        (log.localDate === input.today || log.localDate === yesterday) &&
        log.mood?.includes('thoughts_of_self_harm') === true,
    )
    .map((log) => log.localDate);
  if (evidenceDates.length === 0) return undefined;
  return makeWarning('W-11', 'EMERGENCY', uniqueSortedDates(evidenceDates)[0]!, evidenceDates);
}

/** Pure A11 P1 warning rules W-01..W-07 and W-11 only. */
export function calculateWarnings(
  input: EngineInput,
  episodes: readonly Episode[],
  cycles: readonly CycleStat[],
): readonly A11Warning[] {
  const logs = orderedLogs(input);
  const ordered = orderedEpisodes(episodes);
  const periodEpisodes = ordered.filter((episode) => episode.kind === 'period');
  const lochiaEpisodes = ordered.filter((episode) => episode.kind === 'postpartum_lochia');
  const cycleEpisodes = ordered.filter((episode) => episode.kind !== 'postpartum_lochia');
  const result: A11Warning[] = [];

  const allW01Days = w01ConditionDays(logs);
  const emergencyEvidence = activeW01Evidence(allW01Days, input.today);
  if (emergencyEvidence.length > 0) {
    result.push(
      makeWarning(
        'W-01',
        'EMERGENCY',
        cycleAnchorForDate(emergencyEvidence.at(-1)!, cycleEpisodes) ?? emergencyEvidence.at(-1)!,
        emergencyEvidence,
      ),
    );
  }
  const w02 = w02Warning(logs, periodEpisodes, new Set(allW01Days), input.today);
  if (w02 !== undefined) result.push(w02);
  const w03 = w03Warning(logs, periodEpisodes);
  if (w03 !== undefined) result.push(w03);
  const w04 = w04Warning(cycles, periodEpisodes);
  if (w04 !== undefined) result.push(w04);
  const w05 = w05Warning(input, cycles, periodEpisodes);
  if (w05 !== undefined) result.push(w05);
  const w06 = w06Warning(input, ordered);
  if (w06 !== undefined) result.push(w06);
  const w07 = w07Warning(input, logs, cycleEpisodes, lochiaEpisodes);
  if (w07 !== undefined) result.push(w07);
  const w11 = w11Warning(input, logs);
  if (w11 !== undefined) result.push(w11);

  return result satisfies readonly (WarningCard & { readonly ruleId: WarningRuleId })[];
}
