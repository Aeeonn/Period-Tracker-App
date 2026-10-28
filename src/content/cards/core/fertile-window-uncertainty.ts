import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('fertile-window-uncertainty'),
  title: 'Fertile-window estimates have limits',
  claims: [
    {
      text: 'The fertile window is a six-day interval ending on the day an ovary releases an egg (ovulation).',
      sourceIds: ['ASRM_FERTILITY'],
    },
    {
      text: 'The timing of this window can vary considerably, even for people with regular cycles.',
      sourceIds: ['ASRM_FERTILITY'],
    },
  ],
  modes: ['cycle', 'ttc'],
  symptomTags: [],
  phaseTags: ['fertile'],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
