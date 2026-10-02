import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface PackageLock {
  lockfileVersion?: number;
  packages?: Record<string, LockPackage>;
}

interface LicenseException {
  version: string;
  license: string;
  directDevOnly?: boolean;
  requiredDependency?: { name: string; version: string };
  requiredBy?: string[];
  noticeFiles: string[];
  noticeMustContain: string[];
  reason: string;
}

interface LicensePolicy {
  allowed: string[];
  devOnlyExceptions: Record<string, LicenseException>;
}

const runtimeBudget = new Set(['@preact/signals', 'idb', 'jsqr', 'preact', 'qrcode-generator']);
const approvedDevelopmentTools = new Set([
  '@axe-core/playwright',
  '@playwright/test',
  '@types/node',
  'eslint',
  'fast-check',
  'prettier',
  'tsx',
  'typescript',
  'typescript-eslint',
  'vite',
  'vitest',
  'wrangler',
]);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function parseArgs(): { root: string; scratch: boolean } {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  if (rootIndex === -1) return { root: process.cwd(), scratch: false };
  const path = args[rootIndex + 1];
  if (!path) throw new Error('--root requires a directory');
  return { root: resolve(path), scratch: true };
}

function fail(message: string, errors: string[]): void {
  errors.push(message);
}

function samePins(
  actual: Record<string, string> | undefined,
  expected: Record<string, string> | undefined,
): boolean {
  const left = Object.entries(actual ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const right = Object.entries(expected ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(left) === JSON.stringify(right);
}

function licenseExpressionAllowed(expression: string, allowed: Set<string>): boolean {
  // Parse the SPDX boolean subset without guessing at unsupported syntax. AND binds more tightly
  // than OR; WITH exceptions and any unrecognized token fail closed.
  const tokens: string[] = [];
  const tokenPattern = /[A-Za-z0-9.+:-]+|[()]/g;
  let end = 0;
  for (const match of expression.matchAll(tokenPattern)) {
    const index = match.index;
    if (expression.slice(end, index).trim() !== '') return false;
    tokens.push(match[0]);
    end = index + match[0].length;
  }
  if (tokens.length === 0 || expression.slice(end).trim() !== '') return false;

  let position = 0;
  function parseAtom(): boolean {
    const token = tokens[position];
    if (token === '(') {
      position += 1;
      const value = parseOr();
      if (tokens[position] !== ')') throw new Error('unclosed SPDX group');
      position += 1;
      return value;
    }
    if (!token || token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      throw new Error('unsupported SPDX syntax');
    }
    position += 1;
    return allowed.has(token);
  }
  function parseAnd(): boolean {
    let value = parseAtom();
    while (tokens[position] === 'AND') {
      position += 1;
      const right = parseAtom();
      value = value && right;
    }
    return value;
  }
  function parseOr(): boolean {
    let value = parseAnd();
    while (tokens[position] === 'OR') {
      position += 1;
      const right = parseAnd();
      value = value || right;
    }
    return value;
  }

  try {
    const result = parseOr();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

function main(): number {
  const { root, scratch } = parseArgs();
  const errors: string[] = [];
  const packagePath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const policyPath = join(process.cwd(), 'tools/allowed-licenses.json');

  if (!existsSync(packagePath) || !existsSync(lockPath)) {
    console.error('check:deps requires package.json and package-lock.json');
    return 1;
  }

  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as PackageLock;
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as LicensePolicy;
  const allowedLicenses = new Set(policy.allowed);
  const prod = manifest.dependencies ?? {};
  const dev = manifest.devDependencies ?? {};

  if (lock.lockfileVersion !== 3)
    fail(`expected lockfileVersion 3; got ${lock.lockfileVersion}`, errors);
  for (const name of runtimeBudget) {
    if (!(name in prod)) fail(`runtime dependency budget is missing ${name}`, errors);
  }
  for (const name of Object.keys(prod)) {
    if (!runtimeBudget.has(name)) fail(`unapproved runtime dependency: ${name}`, errors);
  }
  for (const name of Object.keys(dev)) {
    if (!approvedDevelopmentTools.has(name))
      fail(`unapproved direct development dependency: ${name}`, errors);
  }
  for (const name of approvedDevelopmentTools) {
    if (!(name in dev)) fail(`approved toolchain dependency is missing: ${name}`, errors);
  }
  for (const [section, dependencies] of [
    ['dependencies', prod],
    ['devDependencies', dev],
  ] as const) {
    for (const [name, version] of Object.entries(dependencies)) {
      if (!exactVersion.test(version))
        fail(`${section} ${name} must be an exact version, got ${version}`, errors);
    }
  }

  const rootLockEntry = lock.packages?.[''];
  if (!rootLockEntry) {
    fail('package-lock.json has no root package entry', errors);
  } else {
    const rootLock = rootLockEntry as LockPackage & PackageJson;
    if (!samePins(rootLock.dependencies, prod))
      fail('lockfile runtime pins do not match package.json', errors);
    if (!samePins(rootLock.devDependencies, dev))
      fail('lockfile development pins do not match package.json', errors);
  }

  const entries = Object.entries(lock.packages ?? {}).filter(([path]) =>
    path.startsWith('node_modules/'),
  );
  if (entries.length === 0) fail('lockfile contains no installed package entries', errors);
  const exceptionEntries = new Map<string, string>();
  for (const [lockPathName, lockEntry] of entries) {
    const packageName = packageNameFromLockPath(lockPathName);
    const packageJsonPath = join(root, lockPathName, 'package.json');
    const installed = existsSync(packageJsonPath)
      ? (JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
          name?: string;
          version?: string;
          license?: string | { type?: string };
          dependencies?: Record<string, string>;
        })
      : undefined;
    if (!installed && !lockEntry.optional) {
      fail(`${packageName}: locked dependency is missing from node_modules`, errors);
    }
    if (installed?.name !== undefined && installed.name !== packageName) {
      fail(`${packageName}: installed package metadata name mismatch`, errors);
    }
    if (installed?.version !== undefined && installed.version !== lockEntry.version) {
      fail(
        `${packageName}: installed version ${installed.version} differs from lock ${lockEntry.version}`,
        errors,
      );
    }
    const installedLicense =
      typeof installed?.license === 'string' ? installed.license : installed?.license?.type;
    if (installedLicense && lockEntry.license && installedLicense !== lockEntry.license) {
      fail(
        `${packageName}: package-lock license ${lockEntry.license} differs from installed ${installedLicense}`,
        errors,
      );
    }
    const declaredLicense = installedLicense ?? lockEntry.license;
    if (!declaredLicense) {
      fail(`${packageName}: neither installed metadata nor lockfile has an SPDX license`, errors);
      continue;
    }

    const exception = policy.devOnlyExceptions[packageName];
    if (exception) {
      if (lockEntry.version !== exception.version) {
        fail(
          `${packageName}: exception covers only ${exception.version}; lock has ${lockEntry.version}`,
          errors,
        );
      }
      if (declaredLicense !== exception.license) {
        fail(
          `${packageName}: expected exact scoped license ${exception.license}, found ${declaredLicense}`,
          errors,
        );
      }
      if (lockEntry.dev !== true) {
        fail(`${packageName}: license exception is dev-only; package is not marked dev`, errors);
      }
      if (packageName in prod) {
        fail(`${packageName}: scoped license exception cannot be used at runtime`, errors);
      }
      if (exception.directDevOnly && !(packageName in dev)) {
        fail(`${packageName}: scoped exception requires a direct devDependency`, errors);
      }
      if (!exception.directDevOnly && packageName in dev) {
        fail(
          `${packageName}: scoped exception is only permitted as a required transitive dependency`,
          errors,
        );
      }
      if (!exception.directDevOnly && (exception.requiredBy?.length ?? 0) === 0) {
        fail(`${packageName}: scoped transitive exception has no approved parent`, errors);
      }
      for (const parent of exception.requiredBy ?? []) {
        if (!(parent in dev) || parent in prod) {
          fail(`${packageName}: scoped exception requires dev-only parent ${parent}`, errors);
        } else if (!dependencyTreeContains(root, lock, parent, packageName, exception.version)) {
          fail(`${packageName}: ${parent} does not require this exact transitive package`, errors);
        }
      }
      if (exception.requiredDependency) {
        const { name, version } = exception.requiredDependency;
        const childPath = lockDependencyPath(root, lockPathName, name, lock.packages ?? {});
        const child = childPath ? lock.packages?.[childPath] : undefined;
        if (
          !installed?.dependencies?.[name] ||
          child?.version !== version ||
          !dependencyTreeContains(root, lock, packageName, name, version)
        ) {
          fail(`${packageName}: required dependency ${name}@${version} is absent`, errors);
        }
      }
      if (installed) {
        const noticeContents: string[] = [];
        for (const file of exception.noticeFiles) {
          const noticePath = join(root, lockPathName, file);
          if (!existsSync(noticePath)) {
            fail(`${packageName}: required license notice ${file} is missing`, errors);
          } else {
            noticeContents.push(readFileSync(noticePath, 'utf8'));
          }
        }
        const notices = noticeContents.join('\n');
        for (const requiredText of exception.noticeMustContain) {
          if (!notices.includes(requiredText)) {
            fail(
              `${packageName}: required license notice text is missing: ${requiredText}`,
              errors,
            );
          }
        }
      }
      exceptionEntries.set(packageName, declaredLicense);
    } else if (!licenseExpressionAllowed(declaredLicense, allowedLicenses)) {
      fail(`${packageName}: disallowed license ${declaredLicense}`, errors);
    }
  }

  for (const name of Object.keys(policy.devOnlyExceptions)) {
    if (!exceptionEntries.has(name))
      fail(`${name}: required scoped license exception package is absent`, errors);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL ${error}`);
    return 1;
  }

  console.log(`Exact direct pins and lockfile v${lock.lockfileVersion} verified.`);
  console.log(
    `Runtime allowlist verified (${runtimeBudget.size} packages); all installed licenses are allowlisted or narrowly excepted.`,
  );
  console.log(
    `Exact-version dev-only license exceptions and required notice text verified (${exceptionEntries.size} packages).`,
  );

  if (scratch) {
    console.log('Audit skipped for explicit scratch-root negative-case validation.');
    return 0;
  }

  const tree = spawnSync('npm', ['ls', '--all', '--json'], { cwd: root, encoding: 'utf8' });
  if (tree.status !== 0) {
    console.error(tree.stderr || tree.stdout || 'npm ls --all failed');
    return 1;
  }

  const audit = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (audit.stdout) process.stdout.write(audit.stdout);
  if (audit.stderr) process.stderr.write(audit.stderr);
  if (audit.status !== 0) {
    console.error('npm audit --omit=dev reported high/critical findings or could not complete.');
    return 1;
  }
  console.log('npm audit --omit=dev: no high or critical findings.');
  return 0;
}

function lockDependencyPath(
  root: string,
  parentPath: string,
  dependencyName: string,
  packages: Record<string, LockPackage>,
): string | undefined {
  const absoluteRoot = resolve(root);
  let current = resolve(root, parentPath);
  while (current === absoluteRoot || current.startsWith(`${absoluteRoot}${sep}`)) {
    const candidate = relative(
      absoluteRoot,
      join(current, 'node_modules', ...dependencyName.split('/')),
    )
      .split(sep)
      .join('/');
    if (packages[candidate]) return candidate;
    if (current === absoluteRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function dependencyTreeContains(
  root: string,
  lock: PackageLock,
  sourceName: string,
  targetName: string,
  targetVersion: string,
): boolean {
  const packages = lock.packages ?? {};
  const start = `node_modules/${sourceName}`;
  if (!packages[start]) return false;
  const pending = [start];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath || visited.has(currentPath)) continue;
    visited.add(currentPath);
    const current = packages[currentPath];
    if (!current) continue;
    if (packageNameFromLockPath(currentPath) === targetName && current.version === targetVersion) {
      return true;
    }
    const dependencyNames = new Set([
      ...Object.keys(current.dependencies ?? {}),
      ...Object.keys(current.optionalDependencies ?? {}),
    ]);
    for (const dependencyName of dependencyNames) {
      const childPath = lockDependencyPath(root, currentPath, dependencyName, packages);
      if (childPath && !visited.has(childPath)) pending.push(childPath);
    }
  }
  return false;
}

function packageNameFromLockPath(path: string): string {
  const parts = path.split('/');
  const moduleIndex = parts.lastIndexOf('node_modules');
  const first = parts[moduleIndex + 1];
  if (!first) return path;
  if (first.startsWith('@')) return `${first}/${parts[moduleIndex + 2] ?? ''}`;
  return first;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
