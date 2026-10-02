import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const copyRoots = ['src', 'content', 'public'];
const rootFiles = ['index.html'];
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.xml',
  '.yaml',
  '.yml',
]);
const banned: Array<{ name: string; pattern: RegExp }> = [
  { name: 'safe day', pattern: /\bsafe days?\b/ },
  { name: 'safe to have sex', pattern: /\bsafe to have sex\b/ },
  { name: "can't get pregnant", pattern: /\bcant get pregnant\b/ },
  { name: 'cannot get pregnant', pattern: /\bcannot get pregnant\b/ },
  { name: 'no chance', pattern: /\bno chances?\b/ },
  { name: 'zero chance', pattern: /\bzero chances?\b/ },
  { name: '0%', pattern: /\b0\s*%/ },
  { name: 'infertile day', pattern: /\binfertile days?\b/ },
  { name: 'she wants', pattern: /\bshe want(?:s|ed|ing)?\b/ },
  { name: 'in the mood today', pattern: /\bin the mood today\b/ },
  { name: 'ready for sex', pattern: /\bready for sex\b/ },
  { name: 'good day for sex', pattern: /\bgood days? for sex\b/ },
  { name: 'best day for sex', pattern: /\bbest days? for sex\b/ },
  { name: 'guarantee', pattern: /\bguarantee(?:s|d|ing)?\b/ },
  {
    name: 'unsupported diagnosis claim',
    pattern: /\byou have\s+(?:pcos|endometriosis|fibroids)\b/,
  },
  { name: 'diagnosis:', pattern: /\bdiagnosis\s*:/ },
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
    else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
}

function normalizeCopy(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[’‘`]/g, "'")
    .replace(/'/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function main(): number {
  const root = parseRoot();
  const files: string[] = [];
  for (const copyRoot of copyRoots) collect(join(root, copyRoot), files);
  for (const rootFile of rootFiles) {
    const path = join(root, rootFile);
    if (existsSync(path) && statSync(path).isFile()) files.push(path);
  }

  const findings: string[] = [];
  for (const file of files) {
    const content = normalizeCopy(readFileSync(file, 'utf8'));
    for (const { name, pattern } of banned) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) findings.push(`${relative(root, file)}: banned copy: ${name}`);
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) console.error(`FAIL ${finding}`);
    return 1;
  }
  console.log(`No banned-copy matches in ${files.length} UI/content text files.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
