import { describe, expect, it } from 'vitest';
import {
  PORTABLE_MIN_SCHEMA_VERSION,
  PORTABLE_UPGRADE_STEPS,
  createPortableDocument,
  parsePortableFile,
  type PortableUpgradeSteps,
} from '../../src/backup/portable/codec.ts';
import { SCHEMA_VERSION } from '../../src/data/store/schema.ts';

function fileFor(document: unknown): Blob {
  return new Blob([JSON.stringify(document)]);
}

describe('portable files from older schema versions', () => {
  it('has an upgrade step for every schema version older than the current one', () => {
    // Guard for the first schema bump: raising SCHEMA_VERSION without adding the
    // matching step here would strand every backup made before the bump.
    expect(PORTABLE_MIN_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    expect(PORTABLE_MIN_SCHEMA_VERSION).toBeLessThanOrEqual(SCHEMA_VERSION);
    for (let version = PORTABLE_MIN_SCHEMA_VERSION; version < SCHEMA_VERSION; version += 1) {
      expect(typeof PORTABLE_UPGRADE_STEPS[version], `upgrade step from ${version}`).toBe(
        'function',
      );
    }
  });

  it('upgrades an older file one version at a time, then validates the result', async () => {
    const older = createPortableDocument([], 1);
    const calls: number[] = [];
    const bump =
      (from: number) =>
      (document: unknown): unknown => {
        calls.push(from);
        return { ...(document as object), schemaVersion: from + 1 };
      };
    const steps: PortableUpgradeSteps = { 1: bump(1), 2: bump(2) };

    await expect(parsePortableFile(fileFor(older), 3, steps)).resolves.toEqual({
      ok: true,
      document: { ...older, schemaVersion: 3 },
    });
    expect(calls).toEqual([1, 2]);
  });

  it('refuses an older file when a step is missing, fails, or returns the wrong version', async () => {
    const older = createPortableDocument([], 1);
    const invalid = { ok: false, error: 'invalid_file' };

    await expect(parsePortableFile(fileFor(older), 2, {})).resolves.toEqual(invalid);
    await expect(
      parsePortableFile(fileFor(older), 2, {
        1: () => {
          throw new Error('synthetic upgrade failure');
        },
      }),
    ).resolves.toEqual(invalid);
    await expect(
      parsePortableFile(fileFor(older), 2, { 1: (document) => document }),
    ).resolves.toEqual(invalid);
    // A step must not be able to smuggle in a document that fails validation.
    await expect(
      parsePortableFile(fileFor(older), 2, {
        1: () => ({ schemaVersion: 2, format: 'something-else', records: [] }),
      }),
    ).resolves.toEqual(invalid);
    // Versions below the oldest supported one are refused even if a step exists.
    await expect(
      parsePortableFile(fileFor({ ...older, schemaVersion: 0 }), 1, {
        0: (document) => ({ ...(document as object), schemaVersion: 1 }),
      }),
    ).resolves.toEqual(invalid);
  });

  it('still reads current files and reports newer ones as newer', async () => {
    const current = createPortableDocument([], SCHEMA_VERSION);
    await expect(parsePortableFile(fileFor(current), SCHEMA_VERSION)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      parsePortableFile(fileFor({ ...current, schemaVersion: SCHEMA_VERSION + 1 }), SCHEMA_VERSION),
    ).resolves.toEqual({ ok: false, error: 'newer_schema' });
  });
});
