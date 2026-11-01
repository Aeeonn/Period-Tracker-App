interface NativeTrustedTypesPolicy {
  createScriptURL(value: string): unknown;
}

interface NativeTrustedTypes {
  createPolicy(
    name: string,
    rules: { createScriptURL(value: string): string },
  ): NativeTrustedTypesPolicy;
}

interface WorkerConstructor<T> {
  new (scriptURL: string | URL, options?: WorkerOptions): T;
}

const ENGINE_WORKER_POLICY_NAME = 'flo-engine-worker-script';
let engineWorkerScriptPolicy: NativeTrustedTypesPolicy | undefined;
let engineWorkerPolicyAssetURL: string | undefined;

/** Resolve only the exact same-origin worker asset emitted by Vite. */
export function validateEngineWorkerScriptURL(
  value: string,
  expectedAssetURL: string,
  documentURL: string,
): string {
  let document: URL;
  let expected: URL;
  let candidate: URL;
  try {
    document = new URL(documentURL);
    expected = new URL(expectedAssetURL, document);
    candidate = new URL(value, document);
  } catch {
    throw new TypeError('Only the same-origin bundled engine worker asset is permitted.');
  }

  if (
    document.origin === 'null' ||
    expected.origin !== document.origin ||
    candidate.origin !== document.origin ||
    expected.username !== '' ||
    expected.password !== '' ||
    candidate.username !== '' ||
    candidate.password !== '' ||
    candidate.href !== expected.href
  ) {
    throw new TypeError('Only the same-origin bundled engine worker asset is permitted.');
  }
  return expected.href;
}

function createEngineWorkerScriptPolicy(
  trustedTypes: NativeTrustedTypes,
  expectedAssetURL: string,
  documentURL: string,
): NativeTrustedTypesPolicy {
  return trustedTypes.createPolicy(
    ENGINE_WORKER_POLICY_NAME,
    createEngineWorkerScriptURLRules(expectedAssetURL, documentURL),
  );
}

export function createEngineWorkerScriptURLRules(
  expectedAssetURL: string,
  documentURL: string,
): { createScriptURL(value: string): string } {
  const expected = validateEngineWorkerScriptURL(
    expectedAssetURL,
    expectedAssetURL,
    documentURL,
  );
  return {
    createScriptURL: (value) => validateEngineWorkerScriptURL(value, expected, documentURL),
  };
}

export function createEngineWorkerScriptURL(
  value: string,
  expectedAssetURL: string,
  documentURL: string,
  trustedPolicy?: NativeTrustedTypesPolicy,
): string {
  const validated = validateEngineWorkerScriptURL(value, expectedAssetURL, documentURL);
  if (!trustedPolicy) return validated;
  // The DOM typings omit TrustedScriptURL; the native trusted value is preserved at runtime.
  return trustedPolicy.createScriptURL(validated) as string;
}

function workerScriptURL(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  throw new TypeError('The engine worker requires its bundled URL.');
}

function cachedEngineWorkerScriptPolicy(
  trustedTypes: NativeTrustedTypes,
  expectedAssetURL: string,
  documentURL: string,
): NativeTrustedTypesPolicy {
  if (engineWorkerScriptPolicy) {
    if (engineWorkerPolicyAssetURL !== expectedAssetURL) {
      throw new TypeError('Only the same-origin bundled engine worker asset is permitted.');
    }
    return engineWorkerScriptPolicy;
  }
  engineWorkerScriptPolicy = createEngineWorkerScriptPolicy(
    trustedTypes,
    expectedAssetURL,
    documentURL,
  );
  engineWorkerPolicyAssetURL = expectedAssetURL;
  return engineWorkerScriptPolicy;
}

function createTrustedEngineWorkerConstructor<T>(
  nativeWorker: WorkerConstructor<T>,
  documentURL: string,
  trustedTypes?: NativeTrustedTypes,
): WorkerConstructor<T> {
  let expectedAssetURL: string | undefined;
  return new Proxy(nativeWorker, {
    construct(target, argumentsList, newTarget) {
      const value = workerScriptURL(argumentsList[0]);
      expectedAssetURL ??= validateEngineWorkerScriptURL(value, value, documentURL);
      const scriptURL = trustedTypes
        ? createEngineWorkerScriptURL(
            value,
            expectedAssetURL,
            documentURL,
            cachedEngineWorkerScriptPolicy(trustedTypes, expectedAssetURL, documentURL),
          )
        : createEngineWorkerScriptURL(value, expectedAssetURL, documentURL);
      return Reflect.construct(target, [scriptURL, ...argumentsList.slice(1)], newTarget);
    },
  });
}

export function createBundledEngineWorker(): Worker {
  const documentURL = globalThis.location.href;
  const trustedTypes = (globalThis as typeof globalThis & { trustedTypes?: NativeTrustedTypes })
    .trustedTypes;
  const Worker = createTrustedEngineWorkerConstructor(
    globalThis.Worker,
    documentURL,
    trustedTypes,
  );
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
}
