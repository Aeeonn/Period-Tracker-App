import type { EngineInput, EngineOutput } from '../contracts/engine-api.ts';

export interface EngineWorkerRequest {
  readonly type: 'run';
  readonly input: EngineInput;
}

export type EngineWorkerResponse =
  { readonly type: 'result'; readonly output: EngineOutput } | { readonly type: 'error' };
