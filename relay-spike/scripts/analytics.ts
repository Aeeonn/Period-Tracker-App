// Reads per-invocation CPU time for the measured windows from Cloudflare's GraphQL Workers
// analytics (dataset workersInvocationsAdaptive; available on the Free plan without Workers
// logs or observability). Usage: tsx analytics.ts <windows.json>. Needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in the environment; prints neither (both are scrubbed from any error text).
import { readFileSync } from 'node:fs';
import type { Phase } from './measure.ts';

const LIMIT_MS = 10;
const POLL_MS = 20_000;
const TIMEOUT_MS = 12 * 60_000;

interface Row {
  sum: { requests: number; errors: number };
  quantiles: { cpuTimeP50: number; cpuTimeP95: number; cpuTimeP99: number };
  max: { cpuTime: number };
  dimensions: { status: string };
}

const QUERY = `query ($account: String!, $script: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(
        limit: 20
        filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }
      ) {
        sum { requests errors }
        quantiles { cpuTimeP50 cpuTimeP95 cpuTimeP99 }
        max { cpuTime }
        dimensions { status }
      }
    }
  }
}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const token = required('CLOUDFLARE_API_TOKEN');
const account = required('CLOUDFLARE_ACCOUNT_ID');
const scrub = (text: string): string =>
  text.split(token).join('<token>').split(account).join('<account>');

async function query(script: string, phase: Phase): Promise<Row[]> {
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: { account, script, start: phase.start, end: phase.end },
    }),
  });
  const json = (await response.json()) as {
    data?: { viewer: { accounts: { workersInvocationsAdaptive: Row[] }[] } };
    errors?: { message: string }[] | null;
  };
  if (json.errors?.length || !json.data) {
    throw new Error(scrub(`GraphQL HTTP ${response.status}: ${JSON.stringify(json.errors)}`));
  }
  return json.data.viewer.accounts[0]?.workersInvocationsAdaptive ?? [];
}

const ms = (microseconds: number): string => (microseconds / 1000).toFixed(2);

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: analytics.ts <windows.json>');
  const { script, phases } = JSON.parse(readFileSync(file, 'utf8')) as {
    script: string;
    phases: Phase[];
  };
  const deadline = Date.now() + TIMEOUT_MS;
  let exceeded = false;
  for (const phase of phases) {
    let rows: Row[] = [];
    for (;;) {
      rows = await query(script, phase);
      const counted = rows.reduce((total, row) => total + row.sum.requests, 0);
      if (counted >= phase.sent || Date.now() > deadline) break;
      console.log(`${phase.name}: analytics shows ${counted}/${phase.sent} so far; waiting`);
      await sleep(POLL_MS);
    }
    // Rows are grouped by invocation status; a healthy run has one "success" group whose
    // quantiles cover every measured request. Any other group (e.g. exceededCpu) is shown too.
    const requests = rows.reduce((total, row) => total + row.sum.requests, 0);
    const errors = rows.reduce((total, row) => total + row.sum.errors, 0);
    for (const row of rows) {
      const over = row.quantiles.cpuTimeP95 / 1000 > LIMIT_MS || row.max.cpuTime / 1000 > LIMIT_MS;
      exceeded ||= over;
      console.log(
        `${phase.name} [status ${row.dimensions.status}]: ${row.sum.requests} invocations, ` +
          `CPU p50 ${ms(row.quantiles.cpuTimeP50)} ms, p95 ${ms(row.quantiles.cpuTimeP95)} ms, ` +
          `p99 ${ms(row.quantiles.cpuTimeP99)} ms, max ${ms(row.max.cpuTime)} ms; ` +
          `10 ms exceeded: ${over ? 'YES' : 'no'}`,
      );
    }
    console.log(
      `${phase.name}: ${requests} invocations counted (sent ${phase.sent}), ${errors} errors, ` +
        `window ${phase.start} .. ${phase.end}`,
    );
    if (requests !== phase.sent) {
      console.log(`${phase.name}: WARNING invocation count differs from requests sent`);
    }
  }
  console.log(`FB-02 verdict: 10 ms CPU ${exceeded ? 'EXCEEDED' : 'not exceeded'} in any phase`);
}

main().catch((error: unknown) => {
  console.error(scrub(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
