import type {
  EngineInput,
  EngineOutput,
  EngineParams,
  Explanation,
  PeriodPrediction,
} from '../contracts/engine-api.ts';
import { ENGINE_VERSION } from '../contracts/engine-api.ts';
import { calculateCyclePrediction } from './cycle/prediction.ts';
import { calculateFertility } from './cycle/fertility.ts';
import { deriveEpisodes } from './episodes/index.ts';
import { calculateWarnings } from './warnings/index.ts';
import { PARAMS_V1 } from './params.ts';

function canonicalValue(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('Engine parameters must be JSON values');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(object[key])}`).join(',')}}`;
}

/** Stable, order-independent FNV-1a hash for the versioned parameter object. */
export function hashEngineParams(params: EngineParams): string {
  let hash = 0x811c9dc5;
  for (const character of canonicalValue(params)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function planningText(prediction: PeriodPrediction): string {
  return `Most likely around ${prediction.center} (between ${prediction.lo} and ${prediction.hi}). This is a rule-of-thumb planning range, not a calibrated probability interval.`;
}

function predictionExplanation(
  prediction: EngineOutput['prediction'],
  cycles: EngineOutput['cycles'],
  cycleLength: number | undefined,
  postPillSettling: boolean,
  hormonalEpisodesOnMethod: number,
): Explanation {
  if (prediction.kind === 'suppressed') {
    const message =
      prediction.reason === 'no_data'
        ? 'Log your period to start predictions.'
        : prediction.reason === 'hormonal'
          ? 'Bleeding patterns on this method vary.'
          : prediction.reason === 'postpartum_before_first_period'
            ? 'Predictions pause until a period returns after birth.'
            : 'Predictions are paused in pregnancy mode.';
    return {
      topic: 'prediction',
      messageKey: `prediction.${prediction.reason}`,
      values: { reason: prediction.reason, text: message },
    };
  }

  const valid = cycles.filter((cycle) => cycle.excludedBecause === undefined);
  const recentThree = valid.slice(-3);
  const prior = valid.slice(0, -3);
  const repeatedChange =
    recentThree.length === 3 &&
    prior.some((cycle) => cycle.length !== recentThree[0]?.length) &&
    recentThree.every((cycle) => cycle.length === recentThree[0]?.length);
  let basis =
    prediction.cyclesUsed === 0
      ? 'Using your entered typical cycle length or the 28-day default.'
      : `Based on your last ${prediction.cyclesUsed} cycles.`;
  if (repeatedChange) {
    basis += ' Your cycles recently changed; the window is wider while they settle.';
  } else {
    const latestCycle = valid[valid.length - 1];
    if (
      latestCycle !== undefined &&
      cycleLength !== undefined &&
      latestCycle.length !== cycleLength
    ) {
      basis +=
        latestCycle.length < cycleLength
          ? ' Your last cycle was shorter than usual.'
          : ' Your last cycle was longer than usual.';
    }
  }
  if (postPillSettling) basis += ' This pattern may take time to settle.';
  if (hormonalEpisodesOnMethod >= 3) {
    basis += ' Based on bleeding episodes on this method; the window is at least 4 days wide.';
  }
  return {
    topic: 'prediction',
    messageKey: 'prediction.planning_range',
    values: {
      center: prediction.center,
      lo: prediction.lo,
      hi: prediction.hi,
      cyclesUsed: prediction.cyclesUsed,
      text: planningText(prediction),
      basis,
      planningRange: 'not a calibrated probability interval',
    },
  };
}

/** Pure, deterministic, versioned A1/A2/A3/A4/A5 engine entry point. */
export function runEngine(input: EngineInput, params: EngineParams = PARAMS_V1): EngineOutput {
  const episodes = deriveEpisodes(input, params);
  const cycle = calculateCyclePrediction(input, params, episodes);
  const fertility = calculateFertility(input, params, episodes, cycle);
  const warnings = calculateWarnings(input, episodes, cycle.cycles);
  const validCycles = cycle.cycles.filter((item) => item.excludedBecause === undefined);
  const explanations: Explanation[] = [
    {
      topic: 'episodes',
      messageKey: 'episodes.derived',
      values: { count: episodes.length },
    },
    {
      topic: 'cycles',
      messageKey: 'cycles.filtered',
      values: { included: validCycles.length, total: cycle.cycles.length },
    },
    predictionExplanation(
      cycle.prediction,
      cycle.cycles,
      cycle.cycleLength,
      cycle.postPillSettling,
      cycle.hormonalEpisodesOnMethod,
    ),
    ...fertility.explanations,
  ];
  return {
    engineVersion: ENGINE_VERSION,
    paramsHash: hashEngineParams(params),
    episodes,
    cycles: cycle.cycles,
    prediction: cycle.prediction,
    fertility: fertility.fertility,
    chanceByDay: fertility.chanceByDay,
    warnings,
    tendencies: [],
    explanations,
  };
}

export { ENGINE_VERSION } from '../contracts/engine-api.ts';
export { PARAMS_V1 } from './params.ts';
