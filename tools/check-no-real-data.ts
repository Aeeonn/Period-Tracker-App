import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const dataRoots = ['src', 'tests', 'tools/synthetic', 'docs'];
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);
const textExtensions = new Set([
  '.csv',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const forbiddenCanaries = [
  /\bREAL[_ -]?HEALTH[_ -]?DATA[_ -]?CANARY\b/i,
  /\bPRIVATE[_ -]?RECORD[_ -]?CANARY\b/i,
];

function parseRoot(): string {
  const args = process.argv.slice(2);
  const index = args.indexOf('--root');
  if (index === -1) return process.cwd();
  const root = args[index + 1];
  if (!root) throw new Error('--root requires a directory');
  return resolve(root);
}

function collect(directory: string, files: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path, files);
    else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase()))
      files.push(path);
  }
}

function needsProvenance(relativePath: string): boolean {
  return (
    /(^|\/)(fixtures|golden)(\/|$)/i.test(relativePath) || /\.fixture\.[^.]+$/i.test(relativePath)
  );
}

function hasSyntheticHeader(content: string): boolean {
  const header = content.slice(0, 512).replace(/^\uFEFF/, '');
  return (
    /^\s*(?:(?:\/\/|\/\*|#)\s*)?synthetic\s*:\s*true\b/i.test(header) ||
    /^\s*\{\s*["']synthetic["']\s*:\s*true\b/i.test(header)
  );
}

function main(): number {
  const root = parseRoot();
  const files: string[] = [];
  for (const dataRoot of dataRoots) collect(join(root, dataRoot), files);
  const findings: string[] = [];

  for (const file of files) {
    const relativePath = relative(root, file);
    const content = readFileSync(file, 'utf8');
    if (
      needsProvenance(relativePath) &&
      !relativePath.endsWith('/README.md') &&
      !hasSyntheticHeader(content)
    ) {
      findings.push(`${relativePath}: fixture is missing its synthetic: true provenance header`);
    }
    for (const canary of forbiddenCanaries) {
      if (canary.test(content)) findings.push(`${relativePath}: forbidden real-data canary marker`);
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) console.error(`FAIL ${finding}`);
    return 1;
  }
  console.log(
    `No real-data canaries found in ${files.length} source, test, synthetic, and plan text files.`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
