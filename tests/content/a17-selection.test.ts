import { describe, expect, it } from 'vitest';
import type { ContentCard } from '../../src/contracts/content.ts';
import type { CardSelectionContext } from '../../src/contracts/content.ts';
import { contentCardId } from '../../src/content/cards/core/types.ts';
import { createContentIndex } from '../../src/content/index.ts';
import { parse } from '../../src/lib/localdate/index.ts';

function date(value: string) {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

const SYNTHETIC_SOURCE = {
  title: 'Synthetic selection source',
  url: 'https://example.test/synthetic-content',
  accessed: date('2026-10-28'),
} as const;

function fixture(
  id: string,
  options: {
    readonly modes?: ContentCard['modes'];
    readonly symptoms?: ContentCard['symptomTags'];
    readonly phases?: ContentCard['phaseTags'];
    readonly hasSource?: boolean;
  } = {},
): ContentCard {
  return {
    id: contentCardId(id),
    title: `Synthetic ${id}`,
    body: ['Synthetic fixture text.'],
    modes: options.modes ?? ['cycle'],
    symptomTags: options.symptoms ?? [],
    phaseTags: options.phases ?? [],
    sources:
      options.hasSource === false ? ([] as unknown as ContentCard['sources']) : [SYNTHETIC_SOURCE],
    lastReviewed: date('2026-10-28'),
  };
}

function context(overrides: Partial<CardSelectionContext> = {}): CardSelectionContext {
  return {
    today: date('2026-10-28'),
    lifeStage: 'cycle',
    currentPhase: 'period',
    recentSymptoms: ['cramps'],
    recentlyShown: [],
    ...overrides,
  };
}

describe('A17 deterministic card selection', () => {
  it('TV-I1 selects cramps-basics at score 5', () => {
    const cards = [
      fixture('cramps-basics', { symptoms: ['cramps'], phases: ['period'] }),
      fixture('cycle-phases-intro'),
      fixture('fertile-window-uncertainty', { phases: ['fertile'] }),
    ];

    expect(createContentIndex(cards).select(context())).toEqual({
      cardId: contentCardId('cramps-basics'),
      score: 5,
    });
  });

  it('scores symptom, phase, and general cards as specified', () => {
    const symptom = fixture('symptom-match', { symptoms: ['cramps'] });
    const phase = fixture('phase-match', { phases: ['period'] });
    const general = fixture('general-card');
    const index = createContentIndex([symptom, phase, general]);

    expect(index.select(context())?.score).toBe(3);
    expect(index.select(context({ recentSymptoms: [], currentPhase: 'period' }))?.score).toBe(2);
    expect(index.select(context({ recentSymptoms: [], currentPhase: null }))?.score).toBe(1);
  });

  it('excludes wrong-mode, recently shown, and source-less cards', () => {
    const wrongMode = fixture('other-mode', { modes: ['pregnancy'] });
    const recentlyShown = fixture('recent-card');
    const sourceLess = fixture('source-less', { hasSource: false });
    const eligible = fixture('eligible-card');
    const index = createContentIndex([wrongMode, recentlyShown, sourceLess, eligible]);

    expect(index.select(context({ recentlyShown: [recentlyShown.id] }))).toEqual({
      cardId: eligible.id,
      score: 1,
    });
    expect(index.select(context({ recentlyShown: [recentlyShown.id, eligible.id] }))).toBeNull();
  });

  it('breaks ties independently of input order and rotates deterministically with today', () => {
    const cards = [fixture('general-one'), fixture('general-two'), fixture('general-three')];
    const firstContext = context({ recentSymptoms: [], currentPhase: null });
    const forward = createContentIndex(cards).select(firstContext);
    const reverse = createContentIndex([...cards].reverse()).select(firstContext);
    expect(forward).toEqual(reverse);

    const dailyPicks = [
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ].map(
      (today) =>
        createContentIndex(cards).select(
          context({
            today: date(today),
            recentSymptoms: [],
            currentPhase: null,
          }),
        )?.cardId,
    );
    expect(new Set(dailyPicks).size).toBeGreaterThan(1);
  });

  it('returns null when no card is eligible', () => {
    const index = createContentIndex([fixture('pregnancy-only', { modes: ['pregnancy'] })]);
    expect(index.select(context())).toBeNull();
  });
});
