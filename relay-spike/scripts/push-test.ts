// FB-06 relay half: demonstrates POST /push-test against the live preview relay.
//   1. no Authorization header           -> expect 401, nothing sent
//   2. a wrong bearer value              -> expect 401, nothing sent
//   3. the preview enrollment secret and a synthetic subscription
//                                        -> expect 200 with attempted: 1 and the push service's
//                                           HTTP status for that one encrypted Web Push request
// The synthetic subscription has a freshly generated P-256 key and auth secret and an Apple Web
// Push endpoint with a random token that belongs to no device, so the push service is expected to
// refuse delivery; device delivery is checked later by p0-device-feasibility.
// Needs FLO_PREVIEW_RELAY_URL and FLO_PREVIEW_ENROLLMENT_SECRET. Prints no secret.
import { toBase64Url } from '../src/bytes.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const url = new URL('/push-test', required('FLO_PREVIEW_RELAY_URL'));
  const bearer = required('FLO_PREVIEW_ENROLLMENT_SECRET');
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const body = JSON.stringify({
    subscription: {
      endpoint: `https://web.push.apple.com/${toBase64Url(crypto.getRandomValues(new Uint8Array(48)))}`,
      expirationTime: null,
      keys: {
        p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))),
        auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      },
    },
  });
  const send = (headers: Record<string, string>, payload: string | null) =>
    fetch(url, { method: 'POST', headers, body: payload });

  const anonymous = await send({}, null);
  console.log(`1. no secret, empty body: HTTP ${anonymous.status} ${await anonymous.text()}`);
  const wrong = await send(
    {
      authorization: 'Bearer synthetic-wrong-bearer-0000000000',
      'content-type': 'application/json',
    },
    body,
  );
  console.log(
    `2. wrong secret, synthetic subscription: HTTP ${wrong.status} ${await wrong.text()}`,
  );
  const authorized = await send(
    { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body,
  );
  console.log(
    `3. preview secret, synthetic subscription: HTTP ${authorized.status} ${await authorized.text()}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
