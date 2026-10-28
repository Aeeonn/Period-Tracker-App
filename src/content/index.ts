import { parse } from '../lib/localdate/index.ts';
import type { ContentCardId } from '../contracts/brand.ts';
import type { LocalDate } from '../contracts/localdate.ts';
import type {
  CardSelection,
  CardSelectionContext,
  ContentCard,
  ContentIndex,
  ContentSource,
} from '../contracts/content.ts';
import sourceRegistry from './sources.json' with { type: 'json' };
import condomsAndStiPrevention from './cards/core/condoms-and-sti-prevention.ts';
import consentAndCommunication from './cards/core/consent-and-communication.ts';
import cycleBasics from './cards/core/cycle-basics.ts';
import desireVaries from './cards/core/desire-varies.ts';
import emergencyContraceptionBasics from './cards/core/emergency-contraception-basics.ts';
import fertileWindowUncertainty from './cards/core/fertile-window-uncertainty.ts';
import heavyBleedingWhenToGetHelp from './cards/core/heavy-bleeding-when-to-get-help.ts';
import howPredictionsWork from './cards/core/how-predictions-work.ts';
import howSharingWorks from './cards/core/how-sharing-works.ts';
import notBirthControl from './cards/core/not-birth-control.ts';
import periodPainWhenToGetHelp from './cards/core/period-pain-when-to-get-help.ts';
import pregnancyPossibleAnyDay from './cards/core/pregnancy-possible-any-day.ts';
import spottingVsPeriod from './cards/core/spotting-vs-period.ts';
import whenToTest from './cards/core/when-to-test.ts';
import yourDataAndBackups from './cards/core/your-data-and-backups.ts';
import type { ClaimEvidence, CoreCardDefinition, SourceId } from './cards/core/types.ts';

const REVIEWED_ON = '2026-10-28';

export interface RegisteredSource extends ContentSource {
  readonly publisher: string;
}

function localDate(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid content LocalDate: ${value}`);
  return parsed;
}

const registeredSources = Object.fromEntries(
  Object.entries(sourceRegistry.sources).map(([id, source]) => [
    id,
    Object.freeze({
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      accessed: localDate(source.accessed),
    }),
  ]),
) as Readonly<Record<SourceId, RegisteredSource>>;

export const contentSourcesById: Readonly<Record<string, RegisteredSource>> = registeredSources;
export const crisisResources = sourceRegistry.crisisResources;

const definitions: readonly CoreCardDefinition[] = [
  cycleBasics,
  howPredictionsWork,
  fertileWindowUncertainty,
  notBirthControl,
  pregnancyPossibleAnyDay,
  whenToTest,
  emergencyContraceptionBasics,
  condomsAndStiPrevention,
  heavyBleedingWhenToGetHelp,
  periodPainWhenToGetHelp,
  spottingVsPeriod,
  consentAndCommunication,
  desireVaries,
  howSharingWorks,
  yourDataAndBackups,
];

function resolveClaimSources(claim: ClaimEvidence): readonly ContentSource[] {
  if (claim.sourceIds.length === 0) throw new Error('Every content claim needs a source.');
  return claim.sourceIds.map((sourceId) => {
    const source = registeredSources[sourceId];
    if (!source) throw new Error(`Unknown content source: ${sourceId}`);
    return source;
  });
}

function buildCard(definition: CoreCardDefinition): ContentCard {
  if (definition.claims.length === 0)
    throw new Error(`Card ${definition.id} has no sourced claims.`);
  const sourceIds = [...new Set(definition.claims.flatMap((claim) => claim.sourceIds))];
  const cardSources = sourceIds.map((sourceId) => {
    const source = registeredSources[sourceId];
    if (!source) throw new Error(`Unknown content source: ${sourceId}`);
    return source;
  });
  const [first, ...rest] = cardSources;
  if (!first) throw new Error(`Card ${definition.id} has no source.`);
  for (const claim of definition.claims) resolveClaimSources(claim);

  const sources: readonly [ContentSource, ...ContentSource[]] = [first, ...rest];
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    body: Object.freeze([
      ...definition.claims.map((claim) => claim.text),
      ...(definition.designCopy ?? []),
    ]),
    modes: Object.freeze([...definition.modes]),
    symptomTags: Object.freeze([...definition.symptomTags]),
    phaseTags: Object.freeze([...definition.phaseTags]),
    sources: Object.freeze(sources),
    lastReviewed: localDate(REVIEWED_ON),
  });
}

export const coreCards: readonly ContentCard[] = Object.freeze(definitions.map(buildCard));

export const coreCardEvidence: readonly {
  readonly id: ContentCardId;
  readonly claims: readonly ClaimEvidence[];
  readonly designCopy: readonly string[];
  readonly reviewerTaskId: 'p1-content-core-verify';
}[] = Object.freeze(
  definitions.map(({ id, claims, reviewerTaskId, designCopy }) =>
    Object.freeze({
      id,
      claims,
      designCopy: Object.freeze([...(designCopy ?? [])]),
      reviewerTaskId,
    }),
  ),
);

// FNV-1a 32-bit keeps A17 tie ranking stable without platform APIs.
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

function scoreCard(card: ContentCard, context: CardSelectionContext): number {
  const symptomMatch = card.symptomTags.some((tag) => context.recentSymptoms.includes(tag));
  const phaseMatch = context.currentPhase !== null && card.phaseTags.includes(context.currentPhase);
  const general = card.symptomTags.length === 0 && card.phaseTags.length === 0;
  return (symptomMatch ? 3 : 0) + (phaseMatch ? 2 : 0) + (general ? 1 : 0);
}

function selectCard(
  cards: readonly ContentCard[],
  context: CardSelectionContext,
): CardSelection | null {
  const recentlyShown = new Set(context.recentlyShown);
  let selected: ContentCard | undefined;
  let selectedScore = -1;
  let selectedHash = Number.POSITIVE_INFINITY;

  for (const card of cards) {
    if (!card.modes.includes(context.lifeStage)) continue;
    if (recentlyShown.has(card.id) || card.sources.length === 0) continue;

    const score = scoreCard(card, context);
    const tieHash = hash32(`${card.id}${context.today}`);
    if (
      score > selectedScore ||
      (score === selectedScore &&
        (tieHash < selectedHash ||
          (tieHash === selectedHash && card.id < (selected?.id ?? card.id))))
    ) {
      selected = card;
      selectedScore = score;
      selectedHash = tieHash;
    }
  }

  return selected ? { cardId: selected.id, score: selectedScore } : null;
}

export function createContentIndex(cards: readonly ContentCard[] = coreCards): ContentIndex {
  return Object.freeze({
    all: () => cards,
    get: (id: ContentCardId) => cards.find((card) => card.id === id),
    select: (context: CardSelectionContext) => selectCard(cards, context),
  });
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Serialize body paragraphs as inert text for a renderer that needs markup. */
export function serializeCardBody(card: Pick<ContentCard, 'body'>): string {
  return card.body
    .map(
      (paragraph) =>
        `<p>${paragraph.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)}</p>`,
    )
    .join('');
}

export const contentIndex = createContentIndex();
