import { contentCardId, type CoreCardDefinition } from './types.ts';

// Backup wording follows docs/plan/architecture.md; it is not an external source citation.
const card = {
  id: contentCardId('your-data-and-backups'),
  title: 'Your information and backups',
  claims: [
    {
      text: 'Health information is generally considered sensitive in Canadian privacy guidance.',
      sourceIds: ['OPC_MEANINGFUL_CONSENT'],
    },
  ],
  designCopy: ['A backup is another copy of information saved at the time it is created.'],
  modes: ['cycle', 'ttc', 'pregnancy', 'postpartum', 'perimenopause'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
