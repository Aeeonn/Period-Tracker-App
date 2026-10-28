import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('consent-and-communication'),
  title: 'Consent and communication',
  claims: [
    {
      text: 'Canadian law describes sexual consent as freely agreeing to the activity in question.',
      sourceIds: ['CANADA_CONSENT'],
    },
    {
      text: 'The agreement has to be present when the activity happens.',
      sourceIds: ['CANADA_CONSENT'],
    },
  ],
  modes: ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
