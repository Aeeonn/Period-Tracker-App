import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { buildPrecache } from './build-precache';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const relayMarker = '__RELAY_ORIGIN__';
const customDomainHstsMarker = '__CUSTOM_DOMAIN_HSTS_RULE__';
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const controlCharacterPattern = /[\u0000-\u0020\u007f-\u009f]/;

function isCspSafeHostname(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isIP(hostname.slice(1, -1)) === 6;
  }
  if (isIP(hostname) === 4) return true;
  if (hostname.length > 253) return false;
  return hostname.split('.').every((label) => dnsLabelPattern.test(label));
}

function isIpHostname(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isIP(hostname.slice(1, -1)) === 6;
  }
  return isIP(hostname) !== 0;
}

function validateHttpsOrigin(value: string | undefined, variableName: string): URL | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.trim() !== value || controlCharacterPattern.test(value)) {
    throw new Error(`${variableName} must be an exact HTTPS origin.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an exact HTTPS origin.`);
  }

  if (
    parsed.protocol !== 'https:' ||
    value.includes('*') ||
    parsed.origin !== value ||
    !isCspSafeHostname(parsed.hostname) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error(
      `${variableName} must be an exact HTTPS origin without a path, query, or fragment.`,
    );
  }
  return parsed;
}

export function validateRelayOrigin(value: string | undefined): string | undefined {
  return validateHttpsOrigin(value, 'RELAY_ORIGIN')?.origin;
}

export function validateCustomDomainOrigin(value: string | undefined): string | undefined {
  const parsed = validateHttpsOrigin(value, 'CUSTOM_DOMAIN_ORIGIN');
  if (parsed === undefined) return undefined;
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.port !== '' ||
    isIpHostname(host) ||
    !host.includes('.') ||
    host.endsWith('.') ||
    host === 'pages.dev' ||
    host.endsWith('.pages.dev')
  ) {
    throw new Error(
      'CUSTOM_DOMAIN_ORIGIN must be an HTTPS custom DNS origin without a port or pages.dev host.',
    );
  }
  return parsed.origin;
}

function outputDirectoryFromArgs(args: readonly string[]): string {
  const index = args.indexOf('--outDir');
  if (index === -1) return resolve(projectRoot, 'dist');

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Expected a directory after --outDir.');
  }

  return resolve(projectRoot, value);
}

export async function buildSecurityHeaders(
  outputDirectory = resolve(projectRoot, 'dist'),
): Promise<void> {
  const relayOrigin = validateRelayOrigin(process.env.RELAY_ORIGIN);
  const customDomainOrigin = validateCustomDomainOrigin(process.env.CUSTOM_DOMAIN_ORIGIN);
  await buildPrecache(outputDirectory);

  const headersPath = resolve(outputDirectory, '_headers');
  const headers = await readFile(headersPath, 'utf8');
  for (const marker of [relayMarker, customDomainHstsMarker]) {
    if (headers.split(marker).length !== 2) {
      throw new Error(`Expected exactly one ${marker} marker in ${basename(headersPath)}.`);
    }
  }

  const customDomainHstsRule = customDomainOrigin
    ? `https://${new URL(customDomainOrigin).hostname}/*\n  Strict-Transport-Security: max-age=63072000; includeSubDomains`
    : '';
  const configuredHeaders = headers
    .replace(relayMarker, relayOrigin ? ` ${relayOrigin}` : '')
    .replace(customDomainHstsMarker, customDomainHstsRule);
  await writeFile(headersPath, configuredHeaders, { encoding: 'utf8' });
  process.stdout.write(
    `Built security headers with ${relayOrigin ? 'the configured relay origin' : 'first-party-only connect-src'} and custom-domain HSTS ${customDomainOrigin ? 'enabled' : 'omitted'} in ${relative(projectRoot, headersPath)}.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildSecurityHeaders(outputDirectoryFromArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
