import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.wrangler',
  '.toolchain-scratch',
]);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.dev.vars',
  '.env',
  '.html',
  '.js',
  '.json',
  '.local',
  '.md',
  '.mjs',
  '.pem',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vars',
  '.yaml',
  '.yml',
]);
const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'private-key material',
    pattern: new RegExp(
      '-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH) )?(?:ENCRYPTED )?PRIVATE KEY-----|' +
        '-----BEGIN PGP ' +
        'PRIVATE KEY BLOCK-----',
      'i',
    ),
  },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: 'credential assignment',
    pattern:
      /["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret|cloudflare_api_token|cf_api_token|password|vapid[_-]?private[_-]?key|enrollment[_-]?secret(?:[_-]?hash)?)["']?\s*[:=]\s*["']?(?!<|\$\{|example\b|placeholder(?:\b|_))[A-Za-z0-9_+/=-]{12,}/i,
  },
  {
    name: 'npm credential assignment',
    pattern:
      /\b(?:_authToken|_password|npm[_-]?token)\s*[:=]\s*["']?(?!<|\$\{|example\b|placeholder(?:\b|_))[^\s#"']{8,}/i,
  },
  {
    name: 'JWT-like credential',
    pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/,
  },
];

function parseRoot(): string {
  const args = process.argv.slice(2);
  const index = args.indexOf('--root');
  if (index === -1) return process.cwd();
  const root = args[index + 1];
  if (!root) throw new Error('--root requires a directory');
  return resolve(root);
}

function isCredentialConfig(file: string): boolean {
  return (
    file === '.npmrc' ||
    file.startsWith('.npmrc.') ||
    file === '.dev.vars' ||
    file.startsWith('.dev.vars.') ||
    file === '.env' ||
    file.startsWith('.env.')
  );
}

function collectFiles(directory: string, output: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(path, output);
    else if (
      entry.isFile() &&
      (textExtensions.has(extension(entry.name)) ||
        entry.name === '.gitignore' ||
        isCredentialConfig(entry.name))
    ) {
      output.push(path);
    }
  }
}

function extension(file: string): string {
  const index = file.lastIndexOf('.');
  return index < 0 ? '' : file.slice(index).toLowerCase();
}

function main(): number {
  const root = parseRoot();
  const files: string[] = [];
  collectFiles(root, files);
  const findings: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const { name, pattern } of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) findings.push(`${relative(root, file)}: ${name}`);
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) console.error(`FAIL ${finding}`);
    return 1;
  }
  console.log(
    `No supported secret patterns found in ${files.length} text and credential-config files.`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
