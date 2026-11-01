import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface Manifest {
  devDependencies: Record<string, string>;
}

const fixtures: string[] = [];

function createScratchRoot(): { root: string; manifest: Manifest } {
  const projectRoot = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'flo-check-deps-'));
  fixtures.push(root);
  copyFileSync(join(projectRoot, 'package-lock.json'), join(root, 'package-lock.json'));
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  const manifest = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf8'),
  ) as Manifest;
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2));
  return { root, manifest };
}

function runCheck(root: string) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', join(process.cwd(), 'tools/check-deps.ts'), '--root', root],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('approved test support dependency gate', () => {
  it('accepts only the approved test support pins and matching Vitest provider pair', () => {
    const { root } = createScratchRoot();

    const result = runCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Exact direct pins and lockfile v3 verified.');
  });

  it('rejects a coverage provider whose exact version differs from Vitest', () => {
    const { root, manifest } = createScratchRoot();
    manifest.devDependencies['@vitest/coverage-v8'] = '4.1.11';
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2));

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@vitest/coverage-v8 must exactly match vitest (4.1.12), got 4.1.11',
    );
  });

  it.each([
    ['fake-indexeddb', '6.2.8', '6.2.7'],
    ['happy-dom', '21.0.5', '21.0.4'],
    ['vitest', '4.1.11', '4.1.12'],
    ['@vitest/coverage-v8', '4.1.11', '4.1.12'],
  ])('rejects an unapproved %s version', (name, actual, approved) => {
    const { root, manifest } = createScratchRoot();
    manifest.devDependencies[name] = actual;
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2));

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `approved development pin ${name} must be ${approved}, got ${actual}`,
    );
  });

  it('rejects an unapproved alternative coverage provider', () => {
    const { root, manifest } = createScratchRoot();
    manifest.devDependencies['@vitest/coverage-istanbul'] = '4.1.12';
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2));

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'unapproved direct development dependency: @vitest/coverage-istanbul',
    );
  });
});
