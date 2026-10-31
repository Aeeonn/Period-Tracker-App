import { describe, expect, it } from 'vitest';
import { parse } from '../../src/lib/localdate/index.ts';
import { contentCardId } from '../../src/content/cards/core/types.ts';
import {
  contentIndex,
  contentSourcesById,
  coreCardEvidence,
  crisisResources,
} from '../../src/content/index.ts';

const EXPECTED_CARD_IDS = [
  'cycle-basics',
  'how-predictions-work',
  'fertile-window-uncertainty',
  'not-birth-control',
  'pregnancy-possible-any-day',
  'when-to-test',
  'emergency-contraception-basics',
  'condoms-and-sti-prevention',
  'heavy-bleeding-when-to-get-help',
  'period-pain-when-to-get-help',
  'spotting-vs-period',
  'consent-and-communication',
  'desire-varies',
  'how-sharing-works',
  'your-data-and-backups',
] as const;

const COPY_RULES = [
  /\bsafe days?\b/i,
  /\bsafe to have sex\b/i,
  /\bcant get pregnant\b/i,
  /\bcannot get pregnant\b/i,
  /\bno chances?\b/i,
  /\bzero chances?\b/i,
  /\b0\s*%/i,
  /\binfertile days?\b/i,
  /\bshe wants\b/i,
  /\bin the mood today\b/i,
  /\bready for sex\b/i,
  /\bgood days? for sex\b/i,
  /\bbest days? for sex\b/i,
  /\bguarantee(?:s|d|ing)?\b/i,
  /\byou have\s+(?:pcos|endometriosis|fibroids)\b/i,
  /\bdiagnosis\s*:/i,
];

function normalizeCopy(text: string): string {
  return text.normalize('NFKC').replace(/[’‘`]/g, '').replace(/'/g, '').toLowerCase();
}

describe('P1 core content acceptance', () => {
  it('T-CONTENT-01: every card has sourced claims, valid LocalDates, and concise copy', () => {
    const cards = contentIndex.all();
    expect(cards.map((card) => card.id)).toEqual(EXPECTED_CARD_IDS.map(contentCardId));
    expect(cards).toHaveLength(15);
    expect(contentIndex.get(contentCardId('not-a-card'))).toBeUndefined();

    for (const card of cards) {
      expect(card.sources.length).toBeGreaterThan(0);
      expect(card.body.length).toBeGreaterThan(0);
      expect(card.body.join(' ').split(/\s+/).length).toBeLessThanOrEqual(150);
      expect(parse(card.lastReviewed)).toBe(card.lastReviewed);
      expect(card.sources.every((source) => parse(source.accessed) === source.accessed)).toBe(true);
      expect(card.sources.every((source) => source.url.startsWith('https://'))).toBe(true);

      const evidence = coreCardEvidence.find((entry) => entry.id === card.id);
      expect(evidence).toBeDefined();
      expect(evidence?.reviewerTaskId).toBe('p1-content-core-verify');
      expect(evidence?.claims.length).toBeGreaterThan(0);
      expect(card.body).toEqual([
        ...(evidence?.claims.map((claim) => claim.text) ?? []),
        ...(evidence?.designCopy ?? []),
      ]);
      for (const claim of evidence?.claims ?? []) {
        expect(claim.sourceIds.length).toBeGreaterThan(0);
        for (const sourceId of claim.sourceIds) {
          const source = contentSourcesById[sourceId];
          expect(source).toBeDefined();
          expect(parse(source!.accessed)).toBe(source!.accessed);
          expect(source!.url.startsWith('https://')).toBe(true);
          expect(source!.publisher).not.toBe('');
          expect(card.sources.some((cardSource) => cardSource.url === source!.url)).toBe(true);
        }
      }
      for (const text of [card.title, ...card.body]) {
        for (const banned of COPY_RULES) expect(normalizeCopy(text)).not.toMatch(banned);
      }
    }
  });

  it('T-UX-03: core copy avoids the banned phrases and diagnosis-like wording', () => {
    for (const card of contentIndex.all()) {
      for (const text of [card.title, ...card.body]) {
        expect(COPY_RULES.some((rule) => rule.test(normalizeCopy(text)))).toBe(false);
      }
    }
  });

  it('keeps content follow-ups localized, clear, and source-backed', () => {
    const periodPain = contentIndex.get(contentCardId('period-pain-when-to-get-help'));
    expect(periodPain?.body).toContain(
      'See a family doctor or nurse practitioner if period pain stops your usual activities.',
    );
    expect(periodPain?.body.join(' ')).not.toMatch(/\bGP\b/i);

    const spotting = contentIndex.get(contentCardId('spotting-vs-period'));
    expect(spotting?.body).toContain(
      'For tracking, note your bleeding type: light, medium, heavy, or spotting.',
    );
    expect(spotting?.body).toContain(
      'Bleeding or spotting between periods, or after sex, is considered abnormal uterine bleeding.',
    );
    expect(spotting?.body).toContain(
      'Talk with a clinician about bleeding or spotting between periods or after sex.',
    );
    expect(spotting?.body.join(' ')).not.toMatch(/\bACOG\b|like this/i);

    const heavy = contentIndex.get(contentCardId('heavy-bleeding-when-to-get-help'));
    const heavyEvidence = coreCardEvidence.find(
      (entry) => entry.id === contentCardId('heavy-bleeding-when-to-get-help'),
    );
    expect(heavy?.body[0]).toContain('anemia');
    expect(heavy?.body[0]).not.toContain('anaemia');
    expect(heavy?.sources.map((source) => source.url)).toContain(
      contentSourcesById['NHS_HEAVY_PERIODS']?.url,
    );
    expect(heavyEvidence?.claims[0]?.sourceIds).toContain('NHS_HEAVY_PERIODS');
    expect(heavyEvidence?.claims[1]?.text).toBe(
      'Tiredness or shortness of breath can occur with heavy periods.',
    );
    expect(heavyEvidence?.claims[1]?.sourceIds).toContain('NHS_HEAVY_PERIODS');
  });

  it('T-CON-14: desire patterns are explicitly separate from consent', () => {
    const desireCard = contentIndex.get(contentCardId('desire-varies'));
    expect(desireCard?.body.join(' ')).toMatch(/desire pattern does not communicate consent/i);
  });

  it('W-11: Canadian 9-8-8 and immediate-danger guidance have current sources', () => {
    const resource = crisisResources['W-11'];
    expect(resource.country).toBe('Canada');
    expect(resource.number).toBe('9-8-8');
    expect(resource.channels).toEqual(['call', 'text']);
    expect(resource.availability).toBe('24/7/365');
    expect(resource.publisher).toContain('CAMH');
    expect(resource.publisher).toContain('Government of Canada');
    expect(resource.immediateDanger).toContain('call 9-1-1');
    for (const sourceId of resource.sourceIds) {
      const source = contentSourcesById[sourceId];
      expect(source?.url.startsWith('https://')).toBe(true);
      expect(source ? parse(source.accessed) : null).toBe(parse('2026-10-28'));
    }
    expect(contentSourcesById['CANADA_988']?.url).toBe('https://988.ca/');
    expect(contentSourcesById['CANADA_988_ABOUT']?.url).toBe('https://988.ca/about-us');
    expect(contentSourcesById['CANADA_MENTAL_HEALTH']?.url).toBe(
      'https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html',
    );
  });
});
