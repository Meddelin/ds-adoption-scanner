import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const withChecks = process.argv.includes('--with-checks');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command) {
  try {
    return execSync(command, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function countFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        count++;
      }
    }
  }

  return count;
}

function printSection(title, lines) {
  console.log(title);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log('');
}

const branch = run('git rev-parse --abbrev-ref HEAD') ?? '(unknown)';
const statusRaw = run('git status --short') ?? '';
const dirtyLines = statusRaw.length > 0
  ? statusRaw.split(/\r?\n/).filter(Boolean)
  : [];

const srcTsFiles = countFiles(path.join(root, 'src'), file =>
  /\.(ts|tsx)$/i.test(file)
);
const testFiles = countFiles(path.join(root, 'tests'), file =>
  /\.test\.ts$/i.test(file)
);
const fixtureFiles = countFiles(path.join(root, 'tests', 'fixtures'), file =>
  /\.(ts|tsx|js|jsx|json)$/i.test(file)
);

const nowIso = new Date().toISOString();

console.log('DS Adoption Scanner - Codex Bootstrap');
console.log(`Generated: ${nowIso}`);
console.log(`Root: ${root}`);
console.log('');

printSection('Git', [
  `Branch: ${branch}`,
  `Dirty files: ${dirtyLines.length}`,
  ...(dirtyLines.slice(0, 10).map(line => line)),
  ...(dirtyLines.length > 10 ? [`... +${dirtyLines.length - 10} more`] : []),
]);

printSection('Codebase Snapshot', [
  `TypeScript source files (src): ${srcTsFiles}`,
  `Test files (*.test.ts): ${testFiles}`,
  `Fixture files: ${fixtureFiles}`,
]);

printSection('Key Files', [
  'AGENTS.md',
  '.codex/PROJECT_CONTEXT.md',
  '.codex/TASK_PLAYBOOK.md',
  '.codex/SESSION_MEMORY.md',
  'README.md',
  'CHANGES.md',
  'ds-scanner-spec.md',
]);

printSection('Core Commands', [
  'npm run build',
  'npm run test',
  'npm run test:unit',
  'npm run test:integration',
  'npm run lint',
  'npm run codex:bootstrap',
  'npm run codex:bootstrap -- --with-checks',
]);

if (withChecks) {
  console.log('Running checks...');

  const build = spawnSync(npmBin, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const test = spawnSync(npmBin, ['run', 'test'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (test.status !== 0) process.exit(test.status ?? 1);

  console.log('Checks finished successfully.');
}
