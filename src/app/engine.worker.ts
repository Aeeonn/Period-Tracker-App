import { runEngine } from '../engine/index.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './engine-worker-messages.ts';

interface EngineWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: EngineWorkerResponse): void;
}

const workerScope = self as unknown as EngineWorkerScope;

function isEngineWorkerRequest(value: unknown): value is EngineWorkerRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Record<string, unknown>;
  return request.type === 'run' && typeof request.input === 'object' && request.input !== null;
}

workerScope.addEventListener('message', (event) => {
  if (!isEngineWorkerRequest(event.data)) return;

  try {
    workerScope.postMessage({ type: 'result', output: runEngine(event.data.input) });
  } catch {
    workerScope.postMessage({ type: 'error' });
  }
});
