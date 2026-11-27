import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, defineConfig, loadEnv, type Plugin } from 'vite';

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

/** Build the service worker as one self-contained /sw.js next to the app. */
function serviceWorker(relayUrl: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'flo-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: 'warn',
        mode: 'production',
        define: { 'import.meta.env.VITE_RELAY_URL': JSON.stringify(relayUrl) },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          target: 'es2022',
          lib: {
            entry: 'src/sw.ts',
            formats: ['iife'],
            name: 'floServiceWorker',
            fileName: () => 'sw.js',
          },
        },
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const relayUrl = env.VITE_RELAY_URL ?? process.env.VITE_RELAY_URL ?? '';
  return {
    build: { target: 'es2022' },
    plugins: [relayCsp(relayUrl), serviceWorker(relayUrl)],
  };
});
