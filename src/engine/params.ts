import type { EngineParams } from '../contracts/engine-api.ts';

/** Version-one constants from docs/plan/algorithms-spec.md Parameters v1. */
export const PARAMS_V1: EngineParams = {
  historyMaxCycles: 12,
  maxCycleLen: 90,
  maxCycleAgeDays: 365,
  minCycleLen: 15,
  recencyDecay: 0.85,
  defaultCycleLen: 28,
  defaultPeriodLen: 5,
  halfWidthNoHistory: { unknownTypical: 7, typicalGiven: 5 },
  smallSamplePenalty: { n1: 3, n2: 2, n3to5: 1, n6plus: 0 },
  halfWidthClamp: { min: 2, max: 10 },
  lutealRange: { min: 12, max: 16, convention: 14 },
  lutealPlausible: { min: 7, max: 17 },
  coreWindow: { before: 5, after: 1 },
  missedLogRatio: { min: 1.6, max: 2.4 },
};
