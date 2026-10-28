import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('condoms-and-sti-prevention'),
  title: 'Condoms and STI prevention',
  claims: [
    {
      text: 'Correct, consistent condom use lowers the chance of many sexually transmitted infections and unplanned pregnancy.',
      sourceIds: ['WHO_CONDOMS'],
    },
    {
      text: 'Condoms lower risk for most STIs but do not provide full protection against every infection.',
      sourceIds: ['WHO_CONDOMS'],
    },
  ],
  modes: ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
