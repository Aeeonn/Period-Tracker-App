// FB-02 load generator: registers a synthetic device, then sends signed synthetic requests in two
// separated time windows and writes the windows to a JSON file for analytics.ts.
//   phase "signed":    ECDSA P-256 verification + D1 read (device) + D1 writes (nonce)
//   phase "push-sign": the same, plus VAPID JWT signing and aes128gcm encryption of the fixed
//                      push text for a synthetic subscription (built, never sent)
// Usage: tsx measure.ts <windows.json> [count]. Needs FLO_PREVIEW_RELAY_URL and
// FLO_PREVIEW_ENROLLMENT_SECRET in the environment. Prints no secret.
import { writeFileSync } from 'node:fs';
import { toBase64Url, toHex, utf8 } from '../src/bytes.ts';
import { signRequest } from '../src/signed-request.ts';

export interface Phase {
  name: string;
  path: string;
  start: string;
  end: string;
  sent: number;
  statuses: Record<string, number>;
  clientRoundTripMs: { p50: number; p95: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function quantile(sorted: number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}

async function main(): Promise<void> {
  const [windowsFile, countArg] = process.argv.slice(2);
  if (!windowsFile) throw new Error('usage: measure.ts <windows.json> [count]');
  const count = Number(countArg ?? '50');
  const relay = new URL(required('FLO_PREVIEW_RELAY_URL'));
  const bearer = required('FLO_PREVIEW_ENROLLMENT_SECRET');

  const device = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const deviceId = `synthetic-measure-${toHex(crypto.getRandomValues(new Uint8Array(4)))}`;
  const publicKey = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', device.publicKey)),
  );
  const registered = await fetch(new URL('/spike/devices', relay), {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, publicKey }),
  });
  if (registered.status !== 201) throw new Error(`device registration: HTTP ${registered.status}`);

  // Synthetic subscription for the push-sign phase. The Worker builds the push but never sends it.
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const subscription = {
    endpoint: 'https://web.push.apple.com/synthetic-measure-subscription-not-sent',
    keys: {
      p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))),
      auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    },
  };

  const phases: Phase[] = [];
  for (const [name, path] of [
    ['signed', '/spike/signed'],
    ['push-sign', '/spike/push-sign'],
  ] as const) {
    await sleep(5000);
    const start = new Date();
    const statuses: Record<string, number> = {};
    const roundTrips: number[] = [];
    for (let seq = 0; seq < count; seq += 1) {
      const body = JSON.stringify(
        name === 'signed' ? { synthetic: true, seq } : { synthetic: true, seq, subscription },
      );
      const ts = Math.floor(Date.now() / 1000);
      const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
      const sig = await signRequest(
        device.privateKey,
        deviceId,
        'POST',
        path,
        ts,
        nonce,
        utf8(body),
      );
      const began = performance.now();
      const response = await fetch(new URL(path, relay), {
        method: 'POST',
        headers: { 'content-type': 'application/json', sig },
        body,
      });
      await response.arrayBuffer();
      roundTrips.push(performance.now() - began);
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
    }
    const end = new Date();
    roundTrips.sort((a, b) => a - b);
    const phase: Phase = {
      name,
      path,
      // Whole-second window edges with one second of margin.
      start: new Date(Math.floor(start.getTime() / 1000) * 1000 - 1000).toISOString(),
      end: new Date(Math.ceil(end.getTime() / 1000) * 1000 + 1000).toISOString(),
      sent: count,
      statuses,
      clientRoundTripMs: {
        p50: Math.round(quantile(roundTrips, 0.5)),
        p95: Math.round(quantile(roundTrips, 0.95)),
      },
    };
    phases.push(phase);
    console.log(
      `${name}: sent ${count} signed synthetic requests to ${path}; HTTP statuses ${JSON.stringify(statuses)}; ` +
        `client round trip p50 ${phase.clientRoundTripMs.p50} ms, p95 ${phase.clientRoundTripMs.p95} ms (network, not CPU)`,
    );
  }
  writeFileSync(windowsFile, JSON.stringify({ script: 'flo-preview-relay', phases }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
