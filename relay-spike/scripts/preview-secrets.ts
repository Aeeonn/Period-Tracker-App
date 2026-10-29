// Preview-only secret helper for setup-secrets.sh. Prints to stdout, which the shell script
// redirects into a 0600 file outside the repository or pipes into `wrangler secret put`.
//   new   -> env-file lines with a fresh enrollment secret and VAPID P-256 key pair
//   hash  -> hex SHA-256 of FLO_PREVIEW_ENROLLMENT_SECRET (the Worker stores only the hash)
//   vapid -> the VAPID private JWK JSON decoded from FLO_PREVIEW_VAPID_PRIVATE_JWK_B64
import { fromBase64Url, sha256, toBase64Url, toHex, utf8 } from '../src/bytes.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(command: string | undefined): Promise<void> {
  if (command === 'new') {
    const enrollment = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const vapid = toBase64Url(
      utf8(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })),
    );
    process.stdout.write(
      `FLO_PREVIEW_ENROLLMENT_SECRET=${enrollment}\nFLO_PREVIEW_VAPID_PRIVATE_JWK_B64=${vapid}\n`,
    );
  } else if (command === 'hash') {
    process.stdout.write(toHex(await sha256(utf8(required('FLO_PREVIEW_ENROLLMENT_SECRET')))));
  } else if (command === 'vapid') {
    const bytes = fromBase64Url(required('FLO_PREVIEW_VAPID_PRIVATE_JWK_B64'));
    if (!bytes) throw new Error('FLO_PREVIEW_VAPID_PRIVATE_JWK_B64 is not base64url');
    process.stdout.write(new TextDecoder().decode(bytes));
  } else {
    throw new Error('usage: preview-secrets.ts new|hash|vapid');
  }
}

main(process.argv[2]).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
