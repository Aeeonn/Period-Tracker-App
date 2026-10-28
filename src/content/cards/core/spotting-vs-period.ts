import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('spotting-vs-period'),
  title: 'Spotting and period changes',
  claims: [
    {
      text: 'When tracking bleeding, ACOG lists spotting as its own type, next to light, medium, and heavy.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'ACOG counts bleeding or spotting between periods, or after sex, as abnormal uterine bleeding.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'Possible causes include changes in egg release, pregnancy, infection, or growths in the uterus.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'Talk with a clinician about any bleeding or spotting like this.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
  ],
  modes: ['cycle', 'postpartum'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
