import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('emergency-contraception-basics'),
  title: 'Emergency contraception',
  claims: [
    {
      text: 'Emergency contraception can reduce the chance of an unplanned pregnancy after sex without a method or when a method fails.',
      sourceIds: ['WHO_EMERGENCY_CONTRACEPTION'],
    },
    {
      text: 'It works best when used as soon as possible.',
      sourceIds: ['WHO_EMERGENCY_CONTRACEPTION'],
    },
    {
      text: 'Emergency contraceptive pills delay or prevent the release of an egg; they do not end an established pregnancy.',
      sourceIds: ['WHO_EMERGENCY_CONTRACEPTION'],
    },
  ],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
