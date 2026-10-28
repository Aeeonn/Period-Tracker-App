import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('desire-varies'),
  title: 'Desire can change',
  claims: [
    {
      text: 'Sexual interest can shift for many reasons, including stress, relationships, health, and life changes.',
      sourceIds: ['NHS_LIBIDO'],
    },
    {
      text: 'A desire pattern does not communicate consent; consent is a voluntary agreement to the activity at the time.',
      sourceIds: ['NHS_LIBIDO', 'CANADA_CONSENT'],
    },
  ],
  modes: ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
