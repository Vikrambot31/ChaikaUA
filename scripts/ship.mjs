import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);

const has = (name) => args.includes(name);
const valueOf = (name, fallback = '') => {
  const exact = args.indexOf(name);
  if (exact >= 0 && args[exact + 1] && !args[exact + 1].startsWith('--')) return args[exact + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
};

const help = `
Usage:
  npm run ship -- --message "Commit message"
  npm run ship:full -- --message "Commit message"

What it does:
  1. Runs project checks.
  2. Stages all changes and commits them.
  3. Optionally deploys Firebase rules/storage/functions.
  4. Optionally pushes to git remote if one exists.

Options:
  --message, -m <text>       Commit message. Default: "Ship project updates".
  --deploy                  Deploy Firebase database, storage, functions.
  --deploy=rules            Deploy database and storage only.
  --deploy=functions        Deploy functions only.
  --push                    Push current branch after commit/deploy.
  --no-checks               Skip all checks.
  --no-admin-build          Skip admin-panel production build.
  --dry-run                 Print actions without changing git/deploying.
  --help                    Show this help.
`;

if (has('--help') || has('-h')) {
  console.log(help.trim());
  process.exit(0);
}

const dryRun = has('--dry-run');
const skipChecks = has('--no-checks');
const skipAdminBuild = has('--no-admin-build');
const pushRequested = has('--push');
const deployArg = valueOf('--deploy', has('--deploy') ? 'all' : '');
const message = valueOf('--message', valueOf('-m', 'Ship project updates')).trim() || 'Ship project updates';

const run = (command, commandArgs = [], options = {}) => {
  const pretty = [command, ...commandArgs].join(' ');
  console.log(`\n$ ${pretty}`);
  if (dryRun && !options.readonly) return '';

  const result = spawnSync(command, commandArgs, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf8',
    ...options.spawn,
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Command failed: ${pretty}`);
  }

  return options.capture ? String(result.stdout || '').trim() : '';
};

const read = (command, commandArgs = []) => {
  try {
    return execFileSync(command, commandArgs, { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch {
    return '';
  }
};

const ensureRepo = () => {
  const inside = read('git', ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') throw new Error('This script must be run inside a git repository.');
};

const assertNoSensitiveFiles = () => {
  const status = read('git', ['status', '--porcelain']);
  const blocked = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => /(^|\/|\\)(\.env|serviceAccountKey\.json)$|firebase-adminsdk.*\.json$/i.test(file));

  if (blocked.length > 0) {
    throw new Error(`Refusing to commit possible secrets:\n${blocked.join('\n')}`);
  }
};

const runChecks = () => {
  if (skipChecks) {
    console.log('\nChecks skipped by --no-checks.');
    return;
  }

  run('npm', ['run', 'type-check']);
  run('npm', ['run', 'rules:check']);
  run('npm', ['run', 'rules:check:storage']);
  run('npx', ['jest', 'firebaseRulesSecurity', '--runInBand']);

  if (fs.existsSync('functions/package.json')) {
    run('npm', ['--prefix', 'functions', 'run', 'lint']);
  }

  if (fs.existsSync('admin-panel/package.json')) {
    run('npm', ['run', 'type-check'], { spawn: { cwd: 'admin-panel' } });
    run('npm', ['run', 'check:admin-guard'], { spawn: { cwd: 'admin-panel' } });
    if (!skipAdminBuild) run('npm', ['run', 'build'], { spawn: { cwd: 'admin-panel' } });
  }
};

const commitAll = () => {
  const before = read('git', ['status', '--porcelain']);
  if (!before) {
    console.log('\nNo git changes to commit.');
    return false;
  }

  run('git', ['diff', '--check']);
  run('git', ['add', '-A']);
  run('git', ['diff', '--cached', '--check']);
  run('git', ['diff', '--cached', '--stat']);
  run('git', ['commit', '-m', message]);
  return true;
};

const deployFirebase = () => {
  if (!deployArg) return;

  if (deployArg === 'rules') {
    run('npm', ['run', 'deploy:rules']);
    return;
  }

  if (deployArg === 'functions') {
    run('npm', ['run', 'deploy:functions']);
    return;
  }

  if (deployArg === 'all' || deployArg === 'prod') {
    run('npm', ['run', 'deploy:prod']);
    return;
  }

  throw new Error(`Unknown --deploy value: ${deployArg}`);
};

const pushGit = () => {
  if (!pushRequested) return;

  const remotes = read('git', ['remote']);
  if (!remotes) {
    console.log('\nNo git remote configured. Push skipped.');
    return;
  }

  const branch = read('git', ['branch', '--show-current']) || 'master';
  const upstream = read('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream) {
    run('git', ['push']);
  } else if (remotes.split(/\s+/).includes('origin')) {
    run('git', ['push', '-u', 'origin', branch]);
  } else {
    const firstRemote = remotes.split(/\s+/)[0];
    run('git', ['push', '-u', firstRemote, branch]);
  }
};

try {
  ensureRepo();
  assertNoSensitiveFiles();
  runChecks();
  commitAll();
  deployFirebase();
  pushGit();

  console.log('\nShip complete.');
} catch (error) {
  console.error(`\nShip failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
