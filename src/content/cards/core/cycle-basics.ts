import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('cycle-basics'),
  title: 'Cycle basics',
  claims: [
    {
      text: 'Day 1 of a menstrual cycle is the first day of a period; the cycle ends the day before the next period starts.',
      sourceIds: ['NHS_IRREGULAR_PERIODS'],
    },
    {
      text: 'Cycle timing can be shorter or longer than average and may change over time.',
      sourceIds: ['NHS_IRREGULAR_PERIODS'],
    },
  ],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
