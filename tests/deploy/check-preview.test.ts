import { describe, expect, it } from 'vitest';
import {
  extractPageTitle,
  isMissingAssetFallback,
  isNetworkBlockPage,
  previewBuildDirectory,
} from '../../tools/deploy/check-preview.ts';

const syntheticAppTitle = 'Synthetic App Preview';
const syntheticAppIndex = Buffer.from(
  '<!doctype html><html><head><title>Synthetic App Preview</title></head><body>fixture</body></html>',
);

// synthetic: true - checker fixtures are local synthetic HTML; tests make no network requests.
describe('preview checker build selection and response classification', () => {
  it('selects the same app and probe build directories as pages-preview.sh', () => {
    expect(previewBuildDirectory('probe')).toBe('/tmp/flo-preview-build/probe');
    expect(previewBuildDirectory('app')).toBe('/tmp/flo-preview-build/app');
  });

  it('reads the expected page identity from the selected build index', () => {
    expect(extractPageTitle(syntheticAppIndex)).toBe(syntheticAppTitle);
    expect(() => extractPageTitle(Buffer.from('<html><body>no title</body></html>'))).toThrow(
      'missing a non-empty <title>',
    );
  });

  it('classifies a non-HTML asset served as the expected Pages SPA fallback as a missing file', () => {
    expect(
      isMissingAssetFallback(
        'assets/missing.js',
        'text/html; charset=utf-8',
        syntheticAppIndex,
        syntheticAppTitle,
      ),
    ).toBe(true);
    expect(
      isNetworkBlockPage(syntheticAppIndex, 'text/html; charset=utf-8', syntheticAppTitle),
    ).toBe(false);
  });

  it('does not classify HTML routes or non-HTML responses as SPA fallback assets', () => {
    expect(
      isMissingAssetFallback(
        'nested/missing.html',
        'text/html',
        syntheticAppIndex,
        syntheticAppTitle,
      ),
    ).toBe(false);
    expect(
      isMissingAssetFallback(
        'assets/missing.js',
        'application/javascript',
        syntheticAppIndex,
        syntheticAppTitle,
      ),
    ).toBe(false);
  });

  it('retains explicit and unexpected-title network-filter block detection', () => {
    const filterPage = Buffer.from(
      '<html><head><title>Access blocked</title></head><body>Network filter</body></html>',
    );
    const umbrellaPage = Buffer.from('<html><body>Cisco Umbrella blocked</body></html>');

    expect(isNetworkBlockPage(filterPage, 'text/html', syntheticAppTitle)).toBe(true);
    expect(isNetworkBlockPage(umbrellaPage, 'text/html', syntheticAppTitle)).toBe(true);
    expect(
      isMissingAssetFallback('assets/missing.js', 'text/html', filterPage, syntheticAppTitle),
    ).toBe(false);
  });
});
