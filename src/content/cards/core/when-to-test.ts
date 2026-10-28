import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('when-to-test'),
  title: 'When to take a pregnancy test',
  claims: [
    {
      text: 'A missed period can be a reason to consider a home pregnancy test, which detects hCG in urine.',
      sourceIds: ['CANADA_PREGNANCY_TEST'],
    },
    {
      text: 'A test taken too early can show a false negative; if you still think you may be pregnant, consider repeating it or speaking with a health professional.',
      sourceIds: ['CANADA_PREGNANCY_TEST'],
    },
  ],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: [],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
