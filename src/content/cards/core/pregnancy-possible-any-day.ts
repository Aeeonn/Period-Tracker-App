import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('pregnancy-possible-any-day'),
  title: 'Calendar dates cannot rule out pregnancy',
  claims: [
    {
      text: 'A calendar method estimates the fertile window from cycle length, but the window can shift even in regular cycles.',
      sourceIds: ['ASRM_FERTILITY'],
    },
    {
      text: 'The fertile window includes the five days before egg release and the day of release.',
      sourceIds: ['ASRM_FERTILITY'],
    },
    {
      text: 'A calendar estimate cannot rule out pregnancy after sex on a day outside the predicted window.',
      sourceIds: ['ASRM_FERTILITY'],
    },
  ],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
