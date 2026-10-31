import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('period-pain-when-to-get-help'),
  title: 'When period pain needs attention',
  claims: [
    {
      text: 'See a family doctor or nurse practitioner if period pain stops your usual activities.',
      sourceIds: ['NHS_PERIOD_PAIN'],
    },
    {
      text: 'If pain in your pelvis or with your period is severe or stronger than you normally get, and pain medicine has not helped, get urgent medical advice.',
      sourceIds: ['NHS_PERIOD_PAIN'],
    },
  ],
  modes: ['cycle'],
  symptomTags: ['cramps'],
  phaseTags: ['period'],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
