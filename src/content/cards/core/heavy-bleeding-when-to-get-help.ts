import { contentCardId, type CoreCardDefinition } from './types.ts';

const card = {
  id: contentCardId('heavy-bleeding-when-to-get-help'),
  title: 'When heavy bleeding needs attention',
  claims: [
    {
      text: 'Heavy menstrual bleeding can affect daily life and can lead to anemia.',
      sourceIds: ['SOGC_HEAVY_PERIODS', 'NHS_HEAVY_PERIODS'],
    },
    {
      text: 'Tiredness or shortness of breath can occur with heavy periods.',
      sourceIds: ['NHS_HEAVY_PERIODS'],
    },
    {
      text: 'If the amount of bleeding is hard to cope with, the SOGC advises seeing a doctor.',
      sourceIds: ['SOGC_HEAVY_PERIODS'],
    },
  ],
  modes: ['cycle'],
  symptomTags: [],
  phaseTags: ['period'],
  reviewerTaskId: 'p1-content-core-verify',
} as const satisfies CoreCardDefinition;

export default card;
