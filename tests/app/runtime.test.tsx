// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime.tsx';

const roots: HTMLElement[] = [];

async function waitFor(root: HTMLElement, predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error(`App runtime did not reach the expected state: ${root.textContent}`);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AppRuntime fail-closed startup', () => {
  it('announces a safe startup error when same-origin window coordination is unavailable', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    roots.push(root);
    vi.stubGlobal('navigator', {});

    await act(async () => {
      render(<AppRuntime />, root);
    });
    await waitFor(root, () => root.querySelector('[role="alert"]') !== null);

    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'This browser cannot safely coordinate app windows.',
    );
    expect(root.querySelector('[data-testid="lock-screen"]')).toBeNull();
    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});
