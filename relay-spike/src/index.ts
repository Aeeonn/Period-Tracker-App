// Worker entry for the P0 relay spike (preview only, synthetic data only).
import { type Env, handle } from './relay.ts';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, {
      fetch: (url, init) => fetch(url, init),
      nowMs: () => Date.now(),
    });
  },
};
