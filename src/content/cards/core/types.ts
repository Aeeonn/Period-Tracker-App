import type { ContentCardId } from '../../../contracts/brand.ts';
import type { CyclePhase, LifeStage, SymptomBody } from '../../../contracts/enums.ts';
import type sourceRegistry from '../../sources.json';

export type SourceId = keyof typeof sourceRegistry.sources;

export interface ClaimEvidence {
  readonly text: string;
  readonly sourceIds: readonly SourceId[];
}

export interface CoreCardDefinition {
  readonly id: ContentCardId;
  readonly title: string;
  readonly claims: readonly ClaimEvidence[];
  /** Product design copy is documented internally, not as a user-visible source. */
  readonly designCopy?: readonly string[];
  readonly modes: readonly LifeStage[];
  readonly symptomTags: readonly SymptomBody[];
  readonly phaseTags: readonly CyclePhase[];
  readonly reviewerTaskId: 'p1-content-core-verify';
}

const CONTENT_CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function contentCardId(value: string): ContentCardId {
  if (!CONTENT_CARD_ID.test(value)) throw new Error(`Invalid content card id: ${value}`);
  return value as ContentCardId;
}
