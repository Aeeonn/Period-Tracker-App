import { contentCardId, type CoreCardDefinition } from './types.ts';

// Product-design copy follows docs/plan/security-privacy.md CR-01–04, not a user-visible source citation.
const card = {
  id: contentCardId('how-sharing-works'),
  title: 'How sharing works',
  claims: [
    {
      text: 'Health information is generally considered sensitive in Canadian privacy guidance.',
      sourceIds: ['OPC_MEANINGFUL_CONSENT'],
    },
  ],
  designCopy: [
    'In this app, sharing is off until you choose categories, and you can pause it without giving a reason.',
  ],
  modes: ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
