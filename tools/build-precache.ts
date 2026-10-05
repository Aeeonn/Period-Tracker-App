import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformWithEsbuild } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerSourcePath = resolve(projectRoot, 'src/sw/entry.ts');

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    } else {
      throw new Error(`Unsupported build output entry: ${absolutePath}`);
    }
  }

  return files.sort();
}

function parseOutputDirectory(args: readonly string[]): string {
  const index = args.indexOf('--outDir');
  if (index === -1) return resolve(projectRoot, 'dist');

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Expected a directory after --outDir.');
  }

  return resolve(projectRoot, value);
}

export async function buildPrecache(outputDirectory = resolve(projectRoot, 'dist')): Promise<void> {
  await build({
    configFile: resolve(projectRoot, 'vite.config.ts'),
    root: projectRoot,
    build: {
      outDir: relative(projectRoot, outputDirectory),
      emptyOutDir: true,
    },
  });

  await writePrecacheWorker(outputDirectory);
}

export async function writePrecacheWorker(outputDirectory: string): Promise<void> {
  const files = (await listFiles(outputDirectory)).filter(
    (file) =>
      !file.endsWith('/sw.js') && !file.endsWith('/sw.js.map') && basename(file) !== '_headers',
  );
  if (!files.some((file) => relative(outputDirectory, file) === 'index.html')) {
    throw new Error(`Built app shell is missing from ${outputDirectory}.`);
  }

  const relativeFiles = files.map((file) => relative(outputDirectory, file).split(sep).join('/'));
  const precacheUrls = ['/', ...relativeFiles.map((file) => `/${file}`)];
  const source = await readFile(workerSourcePath, 'utf8');
  const transformed = await transformWithEsbuild(source, 'src/sw/entry.ts', {
    target: 'es2022',
    loader: 'ts',
  });

  const digest = createHash('sha256');
  digest.update(transformed.code);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file) continue;
    digest.update(relativeFiles[index] ?? '');
    digest.update(await readFile(file));
  }
  const buildId = digest.digest('hex').slice(0, 20);

  let workerCode = transformed.code.replace(/(["'])__FLO_BUILD_ID__\1/, JSON.stringify(buildId));
  workerCode = workerCode.replace(
    /\[\s*(["'])__FLO_PRECACHE_URLS__\1\s*\]/,
    JSON.stringify(precacheUrls),
  );
  if (workerCode.includes('__FLO_BUILD_ID__') || workerCode.includes('__FLO_PRECACHE_URLS__')) {
    throw new Error('Service-worker build markers were not replaced.');
  }

  const workerPath = resolve(outputDirectory, 'sw.js');
  const temporaryPath = `${workerPath}.tmp`;
  await writeFile(temporaryPath, workerCode, { encoding: 'utf8', flag: 'wx' });
  await rename(temporaryPath, workerPath);

  process.stdout.write(
    `Built service worker ${buildId} with ${precacheUrls.length} precache URLs.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildPrecache(parseOutputDirectory(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
