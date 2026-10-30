import type {
  EngineInput,
  EngineParams,
  Episode,
  Explanation,
  FertilityEstimate,
  Suppressed,
} from '../../contracts/engine-api.ts';
import { SUPPRESSION_CHANCE_CATEGORY } from '../../contracts/enums.ts';
import type { ChanceCategory, SuppressionReason } from '../../contracts/enums.ts';
import type { LocalDate } from '../../contracts/localdate.ts';
import { addDays, compare } from '../../lib/localdate/index.ts';
import {
  hasActiveHormonalMethod,
  isMethodActiveAt,
  isPostpartumBeforeFirstPeriod,
  latestObservedPeriodStart,
} from './shared.ts';
import type { CyclePredictionResult } from './prediction.ts';

export const CHANCE_COPY: Readonly<Partial<Record<ChanceCategory, string>>> = {
  LOWER:
    'Lower \u2014 not zero. Pregnancy is possible on any day you have sex without contraception.',
  PREGNANT_NOT_SHOWN: "You're in pregnancy mode, so conception chance isn't shown.",
  POSSIBLE_BEFORE_FIRST_PERIOD:
    "Can't estimate yet after birth. Pregnancy is possible before your first period returns.",
  DEPENDS_ON_METHOD: 'Depends on using your method correctly.',
  UNKNOWN_TEST: 'Unknown \u2014 your period is late; consider a test.',
  NOT_ESTIMATED_CYCLE_LENGTH:
    "Can't estimate fertile days for cycles this short or long. Pregnancy is possible on any day you have sex without contraception.",
  NO_DATA_YET:
    'Log your period to see estimates. Until then, pregnancy is possible on any day you have sex without contraception.',
};

const EXCLUDED_TAIL_TEXT =
  "Ovulation can happen outside these dates, especially if the time between ovulation and your period is short. The calendar can't tell.";

export interface FertilityResult {
  readonly fertility: FertilityEstimate | Suppressed;
  readonly chanceByDay: Readonly<Record<LocalDate, ChanceCategory>>;
  readonly explanations: readonly Explanation[];
}

function suppressionReason(
  input: EngineInput,
  episodes: readonly Episode[],
  cycle: CyclePredictionResult,
): SuppressionReason | undefined {
  if (input.profile.lifeStage === 'pregnancy') return 'pregnant';
  if (isPostpartumBeforeFirstPeriod(input, episodes)) return 'postpartum_before_first_period';
  if (hasActiveHormonalMethod(input)) return 'hormonal';
  if (cycle.prediction.kind === 'prediction' && cycle.prediction.state === 'late') return 'late';
  if (
    cycle.prediction.kind === 'prediction' &&
    cycle.prediction.cyclesUsed >= 3 &&
    cycle.cycleLength !== undefined &&
    (cycle.cycleLength < 21 || cycle.cycleLength > 45)
  ) {
    return 'cycle_length';
  }
  if (cycle.prediction.kind === 'suppressed') return cycle.prediction.reason;
  if (latestObservedPeriodStart(episodes) === undefined) return 'no_data';
  return undefined;
}

function includes(
  date: LocalDate,
  range: { readonly start: LocalDate; readonly end: LocalDate },
): boolean {
  return compare(date, range.start) >= 0 && compare(date, range.end) <= 0;
}

function laterDate(left: LocalDate, right: LocalDate): LocalDate {
  return compare(left, right) >= 0 ? left : right;
}

function chanceCategoryForDate(
  date: LocalDate,
  fertility: FertilityEstimate | Suppressed,
  reason: SuppressionReason | undefined,
): ChanceCategory {
  if (reason !== undefined) return SUPPRESSION_CHANCE_CATEGORY[reason];
  if (fertility.kind === 'suppressed') return SUPPRESSION_CHANCE_CATEGORY[fertility.reason];
  if (includes(date, fertility.higherDays)) return 'HIGHER';
  if (includes(date, fertility.coreWindow) || includes(date, fertility.possibleBand))
    return 'MEDIUM';
  return 'LOWER';
}

export function calculateFertility(
  input: EngineInput,
  params: EngineParams,
  episodes: readonly Episode[],
  cycle: CyclePredictionResult,
): FertilityResult {
  const reason = suppressionReason(input, episodes, cycle);
  let fertility: FertilityEstimate | Suppressed;
  if (reason !== undefined) {
    fertility = { kind: 'suppressed', reason };
  } else if (cycle.prediction.kind === 'prediction') {
    const ovulationCenter = addDays(cycle.prediction.center, -params.lutealRange.convention);
    const ovulationRange = {
      start: addDays(cycle.prediction.lo, -params.lutealRange.max),
      end: addDays(cycle.prediction.hi, -params.lutealRange.min),
    };
    fertility = {
      kind: 'fertility',
      source: 'calendar',
      ovulationCenter,
      ovulationRange,
      coreWindow: {
        start: addDays(ovulationCenter, -params.coreWindow.before),
        end: addDays(ovulationCenter, params.coreWindow.after),
      },
      possibleBand: {
        start: addDays(ovulationRange.start, -params.coreWindow.before),
        end: addDays(ovulationRange.end, params.coreWindow.after),
      },
      higherDays: { start: addDays(ovulationCenter, -2), end: ovulationCenter },
      markersDisagree: false,
      methodDoesNotChangeOvulation: isMethodActiveAt(input, 'copper_iud', input.today),
    };
  } else {
    fertility = { kind: 'suppressed', reason: cycle.prediction.reason };
  }

  const end =
    cycle.prediction.kind === 'prediction'
      ? laterDate(cycle.prediction.hi, input.today)
      : input.today;
  const categories: Record<LocalDate, ChanceCategory> = {};
  for (let date = cycle.coverageStart; compare(date, end) <= 0; date = addDays(date, 1)) {
    categories[date] = chanceCategoryForDate(date, fertility, reason);
  }

  const explanations: Explanation[] = [];
  if (fertility.kind === 'suppressed') {
    explanations.push({
      topic: 'fertility',
      messageKey: 'fertility.suppressed',
      values: { reason: fertility.reason },
    });
  } else {
    explanations.push({
      topic: 'fertility',
      messageKey: 'fertility.calendar_estimate',
      values: {
        source: fertility.source,
        ovulationCenter: fertility.ovulationCenter,
        excludedTailText: EXCLUDED_TAIL_TEXT,
        ...(fertility.methodDoesNotChangeOvulation
          ? { methodNote: 'Your method does not change ovulation.' }
          : {}),
      },
    });
  }

  const firstCategory = Object.values(categories)[0];
  if (reason !== undefined && firstCategory !== undefined) {
    const text = CHANCE_COPY[firstCategory];
    explanations.push({
      topic: 'chance',
      messageKey: 'chance.suppressed',
      values: {
        reason,
        category: firstCategory,
        ...(text === undefined ? {} : { text }),
      },
    });
  } else {
    explanations.push({
      topic: 'chance',
      messageKey: 'chance.calendar_categories',
      values: { lowerText: CHANCE_COPY.LOWER ?? '' },
    });
  }

  return { fertility, chanceByDay: categories, explanations };
}
