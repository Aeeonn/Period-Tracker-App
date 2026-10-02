import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, resolve } from 'node:path';

const maxInitialJavaScriptGzipBytes = 120 * 1024;
const maxOutputBytes = 1.5 * 1024 * 1024;
const ignoredDirectories = new Set(['.git', 'node_modules']);

function parseRoot(): string {
  const args = process.argv.slice(2);
  const index = args.indexOf('--root');
  if (index === -1) return process.cwd();
  const root = args[index + 1];
  if (!root) throw new Error('--root requires a directory');
  return resolve(root);
}

function collect(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path, files);
    else if (entry.isFile()) files.push(path);
  }
}

function main(): number {
  const root = parseRoot();
  const output = join(root, 'dist');
  if (!existsSync(output)) {
    console.log(
      'SKIP: no dist/ build exists; the app bundle budget is deferred until an app entry is added.',
    );
    return 0;
  }

  const files: string[] = [];
  collect(output, files);
  if (files.length === 0) {
    console.log('SKIP: dist/ is empty; no app bundle is available to measure.');
    return 0;
  }

  let totalBytes = 0;
  let javascriptGzipBytes = 0;
  for (const file of files) {
    const bytes = statSync(file).size;
    totalBytes += bytes;
    if (['.js', '.mjs', '.cjs'].includes(extname(file).toLowerCase())) {
      javascriptGzipBytes += gzipSync(readFileSync(file)).byteLength;
    }
  }

  const failures: string[] = [];
  if (javascriptGzipBytes > maxInitialJavaScriptGzipBytes) {
    failures.push(
      `JavaScript gzip ${javascriptGzipBytes} bytes exceeds ${maxInitialJavaScriptGzipBytes}`,
    );
  }
  if (totalBytes > maxOutputBytes)
    failures.push(`output ${totalBytes} bytes exceeds ${maxOutputBytes}`);
  console.log(
    `JavaScript gzip (all JS counted conservatively): ${javascriptGzipBytes}/${maxInitialJavaScriptGzipBytes} bytes`,
  );
  console.log(`Total output: ${totalBytes}/${maxOutputBytes} bytes`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    return 1;
  }
  console.log('Bundle-size budgets passed.');
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
