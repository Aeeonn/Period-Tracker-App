// T-RELAY-02, configuration part: the committed Worker config and source keep metadata minimal.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const toml = read('wrangler.toml');
const settings = toml
  .split('\n')
  .map((line) => line.replace(/#.*$/, '').trim())
  .filter((line) => line !== '');

function section(name: string): string[] {
  const start = settings.indexOf(`[${name}]`);
  if (start === -1) return [];
  const rest = settings.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('['));
  return end === -1 ? rest : rest.slice(0, end);
}

describe('relay-spike/wrangler.toml', () => {
  it('names the preview Worker and preview D1', () => {
    expect(settings).toContain('name = "flo-preview-relay"');
    expect(settings).toContain('database_name = "flo-preview"');
    expect(settings).toContain('workers_dev = true');
    expect(settings).toContain('preview_urls = false');
  });

  it('configures only the exact synthetic probe origin for credential-free push-test', () => {
    expect(section('vars')).toEqual(['PROBE_ORIGINS = "https://flo-preview-cm6.pages.dev"']);
  });

  it('turns observability, logs and traces off', () => {
    expect(section('observability')).toEqual(['enabled = false']);
    expect(section('observability.logs')).toEqual([
      'enabled = false',
      'invocation_logs = false',
      'persist = false',
    ]);
    expect(section('observability.traces')).toEqual(['enabled = false', 'persist = false']);
  });

  it('has Logpush off and no tail consumers', () => {
    expect(settings).toContain('logpush = false');
    expect(settings).toContain('tail_consumers = []');
    expect(settings).toContain('streaming_tail_consumers = []');
    expect(settings.some((line) => /^\[\[(streaming_)?tail_consumers\]\]$/.test(line))).toBe(false);
  });

  it('has no cron triggers, routes, custom domains or account identifier', () => {
    for (const forbidden of [
      /^\[triggers\]/,
      /^crons\b/,
      /^routes?\b/,
      /^\[\[routes\]\]/,
      /^account_id\b/,
    ]) {
      expect(
        settings.some((line) => forbidden.test(line)),
        String(forbidden),
      ).toBe(false);
    }
  });

  it('opts out of wrangler telemetry for this project', () => {
    expect(settings).toContain('send_metrics = false');
  });
});

describe('relay-spike source and schema', () => {
  const sources = readdirSync(new URL('../src/', import.meta.url)).map((file) =>
    // Drop comment lines so the documentation of what is not read does not trip the check.
    read(`src/${file}`).replace(/^\s*(\/\/|\/\*\*|\*).*$/gm, ''),
  );

  it('never logs and never reads client IP, user-agent or cf geolocation', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/\bconsole\./);
      expect(source).not.toMatch(/cf-connecting-ip|x-forwarded-for|x-real-ip|true-client-ip/i);
      expect(source).not.toMatch(/user-agent/i);
      expect(source).not.toMatch(/\.cf\b/);
    }
  });

  it('has no IP, user-agent or precise wall-clock columns', () => {
    const schema = read('schema.sql')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(schema).not.toMatch(
      /\b(ip|ip_address|user_agent|ua|country|city|created_at|updated_at|timestamp)\b/i,
    );
  });
});
