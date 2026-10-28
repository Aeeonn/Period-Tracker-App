import { describe, expect, it } from 'vitest';
import type { ContentCard } from '../../src/contracts/content.ts';
import { contentCardId } from '../../src/content/cards/core/types.ts';
import { serializeCardBody } from '../../src/content/index.ts';
import { parse } from '../../src/lib/localdate/index.ts';

function syntheticDate() {
  const result = parse('2026-10-28');
  if (result === null) throw new Error('Invalid synthetic LocalDate.');
  return result;
}

describe('content text serialization', () => {
  it('T-SEC-06: serializes markup and event-handler payloads as inert text', () => {
    const card = {
      id: contentCardId('synthetic-xss-fixture'),
      title: 'Synthetic rendering fixture',
      body: [
        '<script>globalThis.syntheticPayloadRan = true</script>',
        '<img src=x onerror=globalThis.syntheticPayloadRan=true>',
      ],
      modes: ['cycle'],
      symptomTags: [],
      phaseTags: [],
      sources: [
        {
          title: 'Synthetic fixture source',
          url: 'https://example.test/synthetic-rendering',
          accessed: syntheticDate(),
        },
      ],
      lastReviewed: syntheticDate(),
    } satisfies ContentCard;

    const serialized = serializeCardBody(card);
    expect(serialized).toContain('&lt;script&gt;');
    expect(serialized).toContain('&lt;/script&gt;');
    expect(serialized).toContain('&lt;img src=x onerror=globalThis.syntheticPayloadRan=true&gt;');
    expect(serialized).not.toContain('<script');
    expect(serialized).not.toContain('<img');
    expect(serialized.match(/<p>/g)).toHaveLength(2);
    expect(
      (globalThis as typeof globalThis & { syntheticPayloadRan?: boolean }).syntheticPayloadRan,
    ).toBeUndefined();
  });
});
