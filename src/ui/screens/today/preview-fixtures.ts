// Synthetic-only preview data; no real health records are included.
import type { EngineInput, EngineOutput } from '../../../contracts/engine-api.ts';
import { SUPPRESSION_CHANCE_CATEGORY, SUPPRESSION_REASONS } from '../../../contracts/enums.ts';
import type { SuppressionReason } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { runEngine } from '../../../engine/index.ts';
import { addDays, parse } from '../../../lib/localdate/index.ts';
import type { TodayScreenProps } from './today-screen.tsx';

function localDate(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

const today = localDate('2026-10-22');
const periodStarts = ['2026-08-16', '2026-09-13', '2026-10-11'].map(localDate);
const periodLogs = periodStarts.flatMap((start) =>
  Array.from({ length: 5 }, (_, offset) => ({
    localDate: addDays(start, offset),
    flow: 'medium' as const,
  })),
);

const input: EngineInput = {
  today,
  profile: { lifeStage: 'cycle', contraception: [] },
  dayLogs: periodLogs,
  episodesOverride: [],
  pregnancies: [],
  coupleEntriesAllowedForInsights: [],
};

const engineOutput = runEngine(input);
const contentSlot = {
  title: 'Did you know?',
  paragraphs: [],
  sourceNote: '',
} as const;

export const TODAY_PREVIEW_FIXTURE: TodayScreenProps = {
  engineOutput,
  today,
  cycleDay: 12,
  stillBleeding: false,
  contentSlot,
  loggedToday: ['Energy: Energised', 'Symptoms: Cramps'],
};

const emergencyOutput: EngineOutput = {
  ...engineOutput,
  warnings: [
    {
      ruleId: 'W-01',
      severity: 'EMERGENCY',
      dismissible: false,
      scopeStart: today,
      evidenceDates: [today],
    },
  ],
};

export const TODAY_EMERGENCY_FIXTURE: TodayScreenProps = {
  ...TODAY_PREVIEW_FIXTURE,
  engineOutput: emergencyOutput,
};

const noDataOutput = runEngine({ ...input, dayLogs: [] });

export const TODAY_NO_DATA_FIXTURE: TodayScreenProps = {
  ...TODAY_PREVIEW_FIXTURE,
  engineOutput: noDataOutput,
  cycleDay: null,
};

const SUPPRESSION_TEXT: Record<SuppressionReason, string> = {
  pregnant: 'Predictions are paused in pregnancy mode.',
  postpartum_before_first_period: 'Predictions pause until a period returns after birth.',
  hormonal: 'Bleeding patterns on this method vary.',
  late: 'Predictions are paused for now.',
  cycle_length: 'Predictions are paused for now.',
  no_data: 'Log your period to start predictions.',
};

function outputForSuppression(reason: SuppressionReason): EngineOutput {
  const predictionExplanation = {
    topic: 'prediction',
    messageKey: `prediction.${reason}`,
    values: { reason, text: SUPPRESSION_TEXT[reason] },
  } as const;

  return {
    ...engineOutput,
    prediction: { kind: 'suppressed', reason },
    fertility: { kind: 'suppressed', reason },
    chanceByDay: { [today]: SUPPRESSION_CHANCE_CATEGORY[reason] },
    explanations: [
      ...engineOutput.explanations.filter((item) => item.topic !== 'prediction'),
      predictionExplanation,
    ],
  };
}

export const TODAY_SUPPRESSION_FIXTURES: Readonly<Record<SuppressionReason, TodayScreenProps>> = {
  pregnant: { ...TODAY_PREVIEW_FIXTURE, engineOutput: outputForSuppression('pregnant') },
  postpartum_before_first_period: {
    ...TODAY_PREVIEW_FIXTURE,
    engineOutput: outputForSuppression('postpartum_before_first_period'),
  },
  hormonal: { ...TODAY_PREVIEW_FIXTURE, engineOutput: outputForSuppression('hormonal') },
  late: { ...TODAY_PREVIEW_FIXTURE, engineOutput: outputForSuppression('late') },
  cycle_length: { ...TODAY_PREVIEW_FIXTURE, engineOutput: outputForSuppression('cycle_length') },
  no_data: TODAY_NO_DATA_FIXTURE,
};

export { SUPPRESSION_REASONS };
