import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Put the relay origin into the built CSP so the app may only talk to itself and the relay. */
function relayCsp(relayUrl: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'flo-relay-csp',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const file = join(outDir, '_headers');
      const origin = relayUrl === '' ? '' : ` ${new URL(relayUrl).origin}`;
      const text = await readFile(file, 'utf8');
      await writeFile(file, text.replace('__RELAY_ORIGIN__', origin));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    build: { target: 'es2022' },
    plugins: [relayCsp(env.VITE_RELAY_URL ?? process.env.VITE_RELAY_URL ?? '')],
  };
});
