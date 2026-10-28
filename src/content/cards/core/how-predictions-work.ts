import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('how-predictions-work'),
  title: 'How period estimates work',
  claims: [
    {
      text: 'Cycle lengths can vary, so an estimate based on earlier period dates may not match the next start.',
      sourceIds: ['NHS_IRREGULAR_PERIODS'],
    },
  ],
  // Product design rationale: docs/plan/algorithms-spec.md A2 uses logged dates for a planning window.
  designCopy: ['The app uses dates you log to show a planning window, not a confirmed start date.'],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
