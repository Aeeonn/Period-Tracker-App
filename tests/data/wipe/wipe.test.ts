import { describe, expect, it } from 'vitest';
import {
  runLocalDataWipe,
  WIPE_STEPS,
  type LocalWipeOperations,
  type WipeStep,
} from '../../../src/data/wipe/index.ts';

function syntheticOperations(
  calls: string[],
  failures: readonly WipeStep[] = [],
): LocalWipeOperations {
  const invoke = (step: WipeStep) => async () => {
    calls.push(step);
    if (failures.includes(step)) throw new Error(`Synthetic ${step} failure`);
  };
  return {
    eraseKeyMaterial: invoke('Crypto-erasure'),
    deleteIndexedDbDatabases: invoke('IndexedDB databases'),
    clearOpfs: invoke('OPFS'),
    clearCacheStorage: invoke('Cache Storage'),
    clearLocalStorage: invoke('localStorage'),
    clearSessionStorage: invoke('sessionStorage'),
    unregisterServiceWorkers: invoke('service workers'),
  };
}

describe('local data wipe', () => {
  it('runs crypto-erasure first and then every local cleanup step in order', async () => {
    const calls: string[] = [];
    const result = await runLocalDataWipe(syntheticOperations(calls));

    expect(calls).toEqual(WIPE_STEPS);
    expect(result).toEqual({ success: true, failures: [] });
  });

  it('continues after failures and reports every failed step without claiming success', async () => {
    const calls: string[] = [];
    const failedSteps: WipeStep[] = ['Crypto-erasure', 'Cache Storage', 'service workers'];
    const result = await runLocalDataWipe(syntheticOperations(calls, failedSteps));

    expect(calls).toEqual(WIPE_STEPS);
    expect(result).toEqual({ success: false, failures: failedSteps });
  });

  it('reports an IndexedDB failure while still attempting remaining storage cleanup', async () => {
    const calls: string[] = [];
    const result = await runLocalDataWipe(syntheticOperations(calls, ['IndexedDB databases']));

    expect(calls).toEqual(WIPE_STEPS);
    expect(result).toEqual({ success: false, failures: ['IndexedDB databases'] });
  });
});
