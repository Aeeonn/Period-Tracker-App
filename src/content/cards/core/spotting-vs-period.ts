import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('spotting-vs-period'),
  title: 'Spotting and period changes',
  claims: [
    {
      text: 'For tracking, note your bleeding type: light, medium, heavy, or spotting.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'Bleeding or spotting between periods, or after sex, is considered abnormal uterine bleeding.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'Possible causes include changes in egg release, pregnancy, infection, or growths in the uterus.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
    {
      text: 'Talk with a clinician about bleeding or spotting between periods or after sex.',
      sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
    },
  ],
  modes: ['cycle', 'postpartum'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
