import { describe, expect, it, vi } from 'vitest';
import type { EngineInput } from '../../src/contracts/engine-api.ts';
import { TODAY_PREVIEW_FIXTURE } from '../../src/ui/screens/today/preview-fixtures.ts';
import { createEngineWorkerRunner } from '../../src/app/engine-runner.ts';
import {
  createEngineWorkerScriptURL,
  createEngineWorkerScriptURLRules,
  validateEngineWorkerScriptURL,
} from '../../src/app/engine-worker-url.ts';

const input: EngineInput = {
  today: TODAY_PREVIEW_FIXTURE.today,
  profile: { lifeStage: 'cycle', contraception: [] },
  dayLogs: [],
  episodesOverride: [],
  pregnancies: [],
  coupleEntriesAllowedForInsights: [],
};

class SyntheticWorker extends EventTarget {
  readonly posted: unknown[] = [];
  terminated = false;
  response: unknown;
  postFailure: Error | undefined;

  constructor(response?: unknown) {
    super();
    this.response = response;
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
    if (this.postFailure) throw this.postFailure;
    if (this.response !== undefined) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: this.response })));
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function runnerFor(worker: SyntheticWorker) {
  return createEngineWorkerRunner(() => worker as unknown as Worker);
}

describe('engine worker runner lifecycle', () => {
  it('sends the deterministic input, resolves a valid result, and terminates the worker', async () => {
    const output = TODAY_PREVIEW_FIXTURE.engineOutput;
    const worker = new SyntheticWorker({ type: 'result', output });

    await expect(runnerFor(worker)(input)).resolves.toBe(output);

    expect(worker.posted).toEqual([{ type: 'run', input }]);
    expect(worker.terminated).toBe(true);
  });

  it('rejects malformed worker responses and safe calculation failures', async () => {
    const malformed = new SyntheticWorker({ type: 'result', output: null });
    await expect(runnerFor(malformed)(input)).rejects.toThrow(
      'The cycle engine worker returned an invalid response.',
    );
    expect(malformed.terminated).toBe(true);

    const failed = new SyntheticWorker({ type: 'error' });
    await expect(runnerFor(failed)(input)).rejects.toThrow(
      'The cycle engine could not calculate safely.',
    );
    expect(failed.terminated).toBe(true);
  });

  it.each(['error', 'messageerror'] as const)(
    'rejects a worker %s event and still terminates the worker',
    async (type) => {
      const worker = new SyntheticWorker();
      const run = runnerFor(worker)(input);
      const event = new Event(type, { cancelable: true });
      worker.dispatchEvent(event);

      await expect(run).rejects.toThrow('The cycle engine worker failed.');
      expect(event.defaultPrevented).toBe(true);
      expect(worker.terminated).toBe(true);
    },
  );

  it('rejects synchronous postMessage failures and ignores duplicate results after settlement', async () => {
    const postFailure = new SyntheticWorker();
    postFailure.postFailure = new Error('synthetic transfer failure');
    await expect(runnerFor(postFailure)(input)).rejects.toThrow(
      'The cycle engine input could not be sent to its worker.',
    );
    expect(postFailure.terminated).toBe(true);

    const output = TODAY_PREVIEW_FIXTURE.engineOutput;
    const duplicate = new SyntheticWorker({ type: 'result', output });
    const listener = vi.fn();
    const run = runnerFor(duplicate)(input).then(listener);
    await expect(run).resolves.toBeUndefined();
    duplicate.dispatchEvent(new MessageEvent('message', { data: { type: 'error' } }));
    expect(listener).toHaveBeenCalledOnce();
    expect(duplicate.terminated).toBe(true);
  });
});

describe('trusted engine worker URL', () => {
  const documentURL = 'https://cycle.synthetic.invalid/today';
  const assetURL = '/assets/engine.worker-abc123.js';
  const expectedURL = new URL(assetURL, documentURL).href;

  it('accepts only the exact same-origin bundled asset', () => {
    expect(validateEngineWorkerScriptURL(assetURL, assetURL, documentURL)).toBe(expectedURL);
    expect(validateEngineWorkerScriptURL(expectedURL, assetURL, documentURL)).toBe(expectedURL);
  });

  it.each([
    '/assets/other.worker-abc123.js',
    '/assets/engine.worker-abc123.js?unexpected=1',
    'https://other.synthetic.invalid/assets/engine.worker-abc123.js',
    '//other.synthetic.invalid/assets/engine.worker-abc123.js',
    'https://cycle.synthetic.invalid@cycle.synthetic.invalid/assets/engine.worker-abc123.js',
    'javascript:alert(1)',
    'not a URL',
  ])('rejects a non-bundled or non-same-origin worker URL: %s', (candidate) => {
    expect(() => validateEngineWorkerScriptURL(candidate, assetURL, documentURL)).toThrow(
      'Only the same-origin bundled engine worker asset is permitted.',
    );
  });

  it('rejects an invalid document URL and a cross-origin expected asset', () => {
    expect(() =>
      validateEngineWorkerScriptURL(assetURL, assetURL, 'not a document URL'),
    ).toThrow('Only the same-origin bundled engine worker asset is permitted.');
    expect(() =>
      validateEngineWorkerScriptURL(
        'https://other.synthetic.invalid/assets/engine.worker-abc123.js',
        'https://other.synthetic.invalid/assets/engine.worker-abc123.js',
        documentURL,
      ),
    ).toThrow('Only the same-origin bundled engine worker asset is permitted.');
  });

  it('creates strict Trusted Types rules that reject arbitrary URLs', () => {
    const rules = createEngineWorkerScriptURLRules(assetURL, documentURL);
    expect(rules.createScriptURL(expectedURL)).toBe(expectedURL);
    expect(() => rules.createScriptURL('/assets/other.worker.js')).toThrow(
      'Only the same-origin bundled engine worker asset is permitted.',
    );
  });

  it('uses the exact validated asset URL when Trusted Types is unavailable', () => {
    expect(createEngineWorkerScriptURL(assetURL, assetURL, documentURL)).toBe(expectedURL);
  });

  it('preserves the native TrustedScriptURL produced for the validated asset', () => {
    const trustedValue = { trustedURL: expectedURL };
    const policy = {
      createScriptURL: vi.fn((value: string) => {
        expect(validateEngineWorkerScriptURL(value, expectedURL, documentURL)).toBe(expectedURL);
        return trustedValue;
      }),
    };

    expect(createEngineWorkerScriptURL(assetURL, assetURL, documentURL, policy)).toBe(
      trustedValue,
    );
    expect(policy.createScriptURL).toHaveBeenCalledOnce();
    expect(policy.createScriptURL).toHaveBeenCalledWith(expectedURL);
  });
});
