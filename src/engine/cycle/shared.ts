import type { EngineInput, Episode } from '../../contracts/engine-api.ts';
import type { ContraceptionMethod } from '../../contracts/enums.ts';
import type { LocalDate } from '../../contracts/localdate.ts';
import { compare, diffDays } from '../../lib/localdate/index.ts';

const HORMONAL_METHODS: ReadonlySet<ContraceptionMethod> = new Set([
  'combined_pill',
  'progestogen_only_pill',
  'patch',
  'ring',
  'hormonal_iud',
  'implant',
  'injection',
]);

export function isHormonalMethod(method: ContraceptionMethod): boolean {
  return HORMONAL_METHODS.has(method);
}

export function isMethodActiveAt(
  input: EngineInput,
  method: ContraceptionMethod,
  date: LocalDate,
): boolean {
  return input.profile.contraception.some(
    (state) =>
      state.method === method &&
      compare(date, state.startDate) >= 0 &&
      (state.endDate === undefined || compare(date, state.endDate) <= 0),
  );
}

export function hasActiveHormonalMethod(input: EngineInput): boolean {
  return input.profile.contraception.some(
    (state) =>
      isHormonalMethod(state.method) &&
      compare(input.today, state.startDate) >= 0 &&
      (state.endDate === undefined || compare(input.today, state.endDate) <= 0),
  );
}

export function currentHormonalEpisode(input: EngineInput, episode: Episode): boolean {
  return input.profile.contraception.some(
    (state) =>
      isHormonalMethod(state.method) &&
      compare(input.today, state.startDate) >= 0 &&
      (state.endDate === undefined || compare(input.today, state.endDate) <= 0) &&
      compare(episode.start, state.startDate) >= 0 &&
      (state.endDate === undefined || compare(episode.start, state.endDate) <= 0),
  );
}

export function hormonalMethodOverlaps(
  input: EngineInput,
  start: LocalDate,
  end: LocalDate,
): boolean {
  return input.profile.contraception.some(
    (state) =>
      isHormonalMethod(state.method) &&
      compare(state.startDate, end) <= 0 &&
      (state.endDate === undefined || compare(state.endDate, start) >= 0),
  );
}

/** The latest recent stop date activates A16's post-pill settling margin. */
export function recentHormonalStop(input: EngineInput): LocalDate | undefined {
  const dates = input.profile.contraception
    .filter(
      (state) =>
        isHormonalMethod(state.method) &&
        state.endDate !== undefined &&
        compare(state.endDate, input.today) <= 0 &&
        diffDays(state.endDate, input.today) < 90,
    )
    .map((state) => state.endDate)
    .filter((date): date is LocalDate => date !== undefined)
    .sort(compare);
  return dates[dates.length - 1];
}

export function latestObservedPeriodStart(episodes: readonly Episode[]): LocalDate | undefined {
  const starts = episodes
    .filter((episode) => episode.kind === 'period' || episode.kind === 'withdrawal')
    .map((episode) => episode.start)
    .sort(compare);
  return starts[starts.length - 1];
}

export function latestBirthDate(input: EngineInput): LocalDate | undefined {
  const dates = input.pregnancies
    .filter((pregnancy) => pregnancy.outcome === 'birth' && pregnancy.endedOn !== undefined)
    .map((pregnancy) => pregnancy.endedOn)
    .filter((date): date is LocalDate => date !== undefined)
    .sort(compare);
  return dates[dates.length - 1];
}

export function isPostpartumBeforeFirstPeriod(
  input: EngineInput,
  episodes: readonly Episode[],
): boolean {
  if (input.profile.lifeStage !== 'postpartum') return false;
  const birthDate = latestBirthDate(input);
  if (birthDate === undefined) return true;
  return !episodes.some(
    (episode) => episode.kind === 'period' && compare(episode.start, birthDate) > 0,
  );
}

export function cycleOverlapsPregnancyOrPostpartum(
  input: EngineInput,
  episodes: readonly Episode[],
  start: LocalDate,
  nextStart: LocalDate,
): boolean {
  for (const pregnancy of input.pregnancies) {
    if (pregnancy.lmp === undefined) continue;
    const pregnancyEnd = pregnancy.endedOn ?? input.today;
    if (compare(start, pregnancyEnd) <= 0 && compare(nextStart, pregnancy.lmp) >= 0) {
      return true;
    }
  }

  if (input.profile.lifeStage !== 'postpartum' || !isPostpartumBeforeFirstPeriod(input, episodes)) {
    return false;
  }
  const birthDate = latestBirthDate(input);
  if (birthDate === undefined) return true;
  return compare(start, birthDate) <= 0 && compare(nextStart, birthDate) >= 0;
}
