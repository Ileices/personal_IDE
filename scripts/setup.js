#!/usr/bin/env node
// ============================================
// Personal IDE — Cross-Platform Setup Script
//
// Run with:   node scripts/setup.js
// Or via npm: npm run setup  (after npm install -g pnpm)
//
// What it does:
//   1. Checks Node.js >= 20
//   2. Checks pnpm is available
//   3. Runs pnpm install
//   4. Builds the shared package
//   5. Checks for Python 3
//   6. Installs Python requirements (if found)
//   7. Creates .env from .env.example (if missing)
//   8. Prints next steps
// ============================================
import { execSync, spawnSync } from 'child_process';
import { existsSync, copyFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const ROOT = resolve(__dirname, '..');

const isWindows = process.platform === 'win32';

// ── Pretty output ───────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg) { console.log(msg); }
function info(msg) { log(`${C.cyan}ℹ${C.reset}  ${msg}`); }
function ok(msg) { log(`${C.green}✓${C.reset}  ${msg}`); }
function warn(msg) { log(`${C.yellow}⚠${C.reset}  ${msg}`); }
function fail(msg) { log(`${C.red}✗${C.reset}  ${msg}`); }
function header(msg) { log(`\n${C.bold}${C.blue}── ${msg} ──${C.reset}`); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      timeout: opts.timeout || 120_000,
      ...opts,
    });
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function runSilent(cmd) {
  const result = run(cmd, { silent: true });
  return result ? result.toString().trim() : null;
}

let errors = 0;

// ═══════════════════════════════════════════════════════════
// Step 1: Check Node.js version
// ═══════════════════════════════════════════════════════════
header('Step 1: Node.js');

const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);

if (nodeMajor >= 20) {
  ok(`Node.js ${nodeVersion} (>= 20 required)`);
} else {
  fail(`Node.js ${nodeVersion} is too old. Please install Node.js 20 or later.`);
  log(`   Download: https://nodejs.org/`);
  errors++;
}

// ═══════════════════════════════════════════════════════════
// Step 2: Check pnpm
// ═══════════════════════════════════════════════════════════
header('Step 2: pnpm');

let pnpmVersion = runSilent('pnpm --version');
if (pnpmVersion) {
  ok(`pnpm ${pnpmVersion}`);
} else {
  warn('pnpm not found. Attempting to install...');
  try {
    run('npm install -g pnpm');
    pnpmVersion = runSilent('pnpm --version');
    if (pnpmVersion) {
      ok(`pnpm ${pnpmVersion} installed successfully`);
    } else {
      fail('Could not install pnpm. Please install manually: npm install -g pnpm');
      errors++;
    }
  } catch {
    fail('Could not install pnpm. Please install manually: npm install -g pnpm');
    errors++;
  }
}

// ═══════════════════════════════════════════════════════════
// Step 3: Install dependencies
// ═══════════════════════════════════════════════════════════
if (pnpmVersion) {
  header('Step 3: Install Node.js dependencies');
  try {
    run('pnpm install');
    ok('Dependencies installed');
  } catch (e) {
    fail('pnpm install failed. Check the output above for errors.');
    errors++;
  }
}

// ═══════════════════════════════════════════════════════════
// Step 4: Build shared package
// ═══════════════════════════════════════════════════════════
if (pnpmVersion) {
  header('Step 4: Build shared package');
  const sharedDir = join(ROOT, 'packages', 'shared');
  if (existsSync(join(sharedDir, 'package.json'))) {
    try {
      run('pnpm --filter @personal-ide/shared build');
      if (existsSync(join(sharedDir, 'dist', 'index.js'))) {
        ok('Shared package built → packages/shared/dist/');
      } else {
        fail('Build ran but dist/index.js not found');
        errors++;
      }
    } catch {
      fail('Failed to build shared package');
      errors++;
    }
  } else {
    warn('packages/shared/package.json not found, skipping');
  }
}

// ═══════════════════════════════════════════════════════════
// Step 5: Check Python 3
// ═══════════════════════════════════════════════════════════
header('Step 5: Python 3');

let pythonCmd = null;
const pyCandidates = isWindows
  ? ['python', 'python3', 'py']
  : ['python3', 'python'];

for (const cmd of pyCandidates) {
  const testArgs = cmd === 'py' ? '-3 --version' : '--version';
  const version = runSilent(`${cmd} ${testArgs}`);
  if (version && version.toLowerCase().includes('python 3')) {
    pythonCmd = cmd === 'py' ? 'py -3' : cmd;
    ok(`${version} via "${pythonCmd}"`);
    break;
  }
}

if (!pythonCmd) {
  warn('Python 3 not found on PATH. The Nano Sea backend requires Python 3.10+.');
  log(`   Download: https://www.python.org/downloads/`);
  log(`   The IDE will work without it, but Nano Sea features will be disabled.`);
}

// ═══════════════════════════════════════════════════════════
// Step 6: Install Python requirements
// ═══════════════════════════════════════════════════════════
if (pythonCmd) {
  header('Step 6: Python dependencies');
  const reqsFile = join(ROOT, 'NANO_train', 'requirements.txt');
  if (existsSync(reqsFile)) {
    info('Installing NANO_train/requirements.txt (this may take a while)...');
    try {
      run(`${pythonCmd} -m pip install -r "${reqsFile}" --quiet`);
      ok('Python dependencies installed');
    } catch {
      warn('Some Python packages may have failed to install.');
      log('   You can install them manually: pip install -r NANO_train/requirements.txt');
    }
  } else {
    info('NANO_train/requirements.txt not found, skipping');
  }
} else {
  header('Step 6: Python dependencies (skipped — Python not found)');
}

// ═══════════════════════════════════════════════════════════
// Step 7: Create .env file
// ═══════════════════════════════════════════════════════════
header('Step 7: Environment file');

const envPath = join(ROOT, '.env');
const envExamplePath = join(ROOT, '.env.example');

if (existsSync(envPath)) {
  ok('.env already exists');
} else if (existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  ok('Created .env from .env.example');
  warn('Edit .env and add your GITHUB_PAT (required for GitHub models)');
  log(`   Get a token at: https://github.com/settings/tokens`);
  log(`   Required scope: models:read`);
} else {
  warn('.env.example not found — you may need to create .env manually');
}

// ═══════════════════════════════════════════════════════════
// Step 8: Verify workspace build readiness
// ═══════════════════════════════════════════════════════════
if (pnpmVersion) {
  header('Step 8: Workspace verification');
  if (process.env.SKIP_SETUP_VERIFY === '1') {
    warn('Skipping verify:workspace (SKIP_SETUP_VERIFY=1)');
  } else {
    info('Running verify:workspace to confirm shared/server/web/testing are ready...');
    try {
      run('pnpm run verify:workspace', { timeout: 600_000 });
      ok('Workspace verification passed');
    } catch {
      fail('Workspace verification failed. Setup completed, but build/typecheck errors must be fixed.');
      errors++;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
log('');
header('Setup Complete');

if (errors > 0) {
  warn(`${errors} issue(s) found. Fix them above before running the IDE.`);
} else {
  ok('Everything looks good!');
}

log('');
log(`${C.bold}Next steps:${C.reset}`);
log(`  1. Edit ${C.cyan}.env${C.reset} and add your ${C.yellow}GITHUB_PAT${C.reset}`);
log(`  2. Run ${C.green}npm run dev${C.reset} to start the IDE`);
log(`  3. Run ${C.green}npm run test:subsystems:e2e${C.reset} for portable subsystem contract checks`);
log(`  4. Open ${C.cyan}http://localhost:5173${C.reset} in your browser`);
log('');
log(`${C.dim}Optional: Start the Nano Sea backend from the Waves button in the IDE toolbar.${C.reset}`);
log('');
