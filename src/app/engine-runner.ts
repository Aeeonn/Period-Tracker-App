import type { EngineOutput } from '../contracts/engine-api.ts';
import type { EngineRunner } from '../ui/screens/today/live-data.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './engine-worker-messages.ts';
import { createBundledEngineWorker } from './engine-worker-url.ts';

function isEngineWorkerResponse(value: unknown): value is EngineWorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Record<string, unknown>;
  if (response.type === 'error') return true;
  return (
    response.type === 'result' && typeof response.output === 'object' && response.output !== null
  );
}

export function createEngineWorkerRunner(
  createWorker: () => Worker = createBundledEngineWorker,
): EngineRunner {
  return async (input) => {
    const worker = createWorker();
    return new Promise<EngineOutput>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onWorkerError);
        worker.removeEventListener('messageerror', onWorkerError);
        worker.terminate();
        settle();
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        const response = event.data;
        if (!isEngineWorkerResponse(response)) {
          finish(() => reject(new Error('The cycle engine worker returned an invalid response.')));
          return;
        }
        if (response.type === 'error') {
          finish(() => reject(new Error('The cycle engine could not calculate safely.')));
          return;
        }
        finish(() => resolve(response.output));
      };
      const onWorkerError = (event: Event) => {
        event.preventDefault();
        finish(() => reject(new Error('The cycle engine worker failed.')));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onWorkerError);
      worker.addEventListener('messageerror', onWorkerError);
      try {
        const request: EngineWorkerRequest = { type: 'run', input };
        worker.postMessage(request);
      } catch {
        finish(() => reject(new Error('The cycle engine input could not be sent to its worker.')));
      }
    });
  };
}

export const runEngineInWorker = createEngineWorkerRunner();
