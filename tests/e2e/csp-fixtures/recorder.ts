import type { BrowserContext, Page } from '@playwright/test';
import { validateRelayOrigin } from '../../../tools/build-security-headers';

export interface NetworkObservation {
  kind: string;
  url: string;
  sourceFile?: string;
  lineNumber?: number;
}

export interface BrowserDiagnostic {
  kind: string;
  message: string;
}

export interface NetworkRecorder {
  observations: NetworkObservation[];
  browserErrors: BrowserDiagnostic[];
  policyViolations(): Promise<NetworkObservation[]>;
  allObservations(): Promise<NetworkObservation[]>;
}

export interface EndpointPolicy {
  version: 1;
  origins: ['self'];
  relayOriginEnvironmentVariable: 'RELAY_ORIGIN';
}

declare global {
  interface Window {
    __floCspViolations?: NetworkObservation[];
    __floCspApiAttempts?: NetworkObservation[];
    __floCspFixtureExecuted?: boolean;
    __floCspFixtureAttempts?: string[];
  }
}

export function resolveAllowedOrigins(policy: EndpointPolicy, appOrigin: string): string[] {
  if (
    policy.version !== 1 ||
    policy.origins.length !== 1 ||
    policy.origins[0] !== 'self' ||
    policy.relayOriginEnvironmentVariable !== 'RELAY_ORIGIN'
  ) {
    throw new Error(
      'The endpoint policy must contain only the first-party origin and configured relay.',
    );
  }

  const origins = [new URL(appOrigin).origin];
  const relayOrigin = validateRelayOrigin(process.env[policy.relayOriginEnvironmentVariable]);
  if (relayOrigin) origins.push(relayOrigin);
  return origins;
}

export async function attachNetworkRecorder(
  context: BrowserContext,
  page: Page,
): Promise<NetworkRecorder> {
  const observations: NetworkObservation[] = [];
  const browserErrors: BrowserDiagnostic[] = [];

  context.on('request', (request) => {
    observations.push({ kind: `request:${request.resourceType()}`, url: request.url() });
  });
  context.on('requestfailed', (request) => {
    observations.push({ kind: `requestfailed:${request.resourceType()}`, url: request.url() });
  });
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push({ kind: 'console', message: message.text() });
  });
  page.on('pageerror', (error) =>
    browserErrors.push({ kind: 'pageerror', message: error.message }),
  );
  await page.addInitScript(() => {
    window.__floCspViolations = [];
    window.__floCspApiAttempts = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__floCspViolations?.push({
        kind: `csp:${event.effectiveDirective}`,
        url: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, argumentsList, newTarget) {
        const workerURL = new URL(String(argumentsList[0]), location.href).href;
        window.__floCspApiAttempts?.push({ kind: 'worker-attempt', url: workerURL });
        return Reflect.construct(target, argumentsList, newTarget);
      },
    });
  });

  return {
    observations,
    browserErrors,
    policyViolations: async () => page.evaluate(() => window.__floCspViolations ?? []),
    allObservations: async () => [
      ...observations,
      ...(await page.evaluate(() => window.__floCspViolations ?? [])),
      ...(await page.evaluate(() => window.__floCspApiAttempts ?? [])),
    ],
  };
}

export function disallowedOrigins(
  observations: readonly NetworkObservation[],
  allowedOrigins: readonly string[],
): string[] {
  const allowed = new Set(allowedOrigins);
  const findings = new Set<string>();
  for (const observation of observations) {
    if (!/^https?:\/\//i.test(observation.url)) continue;
    let origin: string;
    try {
      origin = new URL(observation.url).origin;
    } catch {
      continue;
    }
    if (!allowed.has(origin)) findings.add(`${origin} (${observation.kind})`);
  }
  return [...findings].sort();
}

export function assertOnlyAllowedOrigins(
  observations: readonly NetworkObservation[],
  allowedOrigins: readonly string[],
): void {
  const findings = disallowedOrigins(observations, allowedOrigins);
  if (findings.length > 0) throw new Error(`Disallowed network origins: ${findings.join(', ')}`);
}
