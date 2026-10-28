import { contentCardId, type CoreCardDefinition } from './types.ts';

// Product disclaimer per docs/plan/ux-spec.md; it is not medical advice or a user-visible source citation.
const card = {
  id: contentCardId('not-birth-control'),
  title: 'A cycle estimate is not contraception',
  claims: [
    {
      text: 'The timing of the fertile window can vary considerably, even for people with regular cycles.',
      sourceIds: ['ASRM_FERTILITY'],
    },
  ],
  designCopy: ['This app’s period estimate is for planning, not birth control.'],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
