/**
 * `ContentIndex` (architecture.md §3 `content`; algorithms-spec.md A17;
 * ux-spec.md §8). Cards are original text compiled at build time; every card
 * cites at least one source with an access date (T-CONTENT-01).
 */
import type { ContentCardId } from './brand.ts';
import type { CyclePhase, LifeStage, SymptomBody } from './enums.ts';
import type { LocalDate } from './localdate.ts';

export interface ContentSource {
  readonly title: string;
  readonly url: string;
  readonly accessed: LocalDate;
}

export interface ContentCard {
  readonly id: ContentCardId;
  readonly title: string;
  /** Plain text paragraphs; never rendered as HTML. */
  readonly body: readonly string[];
  readonly modes: readonly LifeStage[];
  readonly symptomTags: readonly SymptomBody[];
  readonly phaseTags: readonly CyclePhase[];
  readonly sources: readonly [ContentSource, ...ContentSource[]];
  readonly lastReviewed: LocalDate;
}

/** Inputs to A17 selection. */
export interface CardSelectionContext {
  readonly today: LocalDate;
  readonly lifeStage: LifeStage;
  readonly currentPhase: CyclePhase | null;
  /** Symptoms logged in the last 3 days. */
  readonly recentSymptoms: readonly SymptomBody[];
  /** Cards shown in the last 14 days. */
  readonly recentlyShown: readonly ContentCardId[];
}

export interface CardSelection {
  readonly cardId: ContentCardId;
  readonly score: number;
}

export interface ContentIndex {
  all(): readonly ContentCard[];
  get(id: ContentCardId): ContentCard | undefined;
  /** Deterministic A17 pick; `null` when no card qualifies. */
  select(context: CardSelectionContext): CardSelection | null;
}
