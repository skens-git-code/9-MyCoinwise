/**
 * Cross-platform backend test runner.
 *
 * WHY THIS EXISTS
 * ---------------
 * `npm test` used to be a shell pipeline:
 *
 *   node --check server.js && find middleware models routes services utils \
 *     -type f -name '*.js' -print0 | xargs -0 -n1 node --check && node test/*.test.js
 *
 * That only works on Linux/macOS. On Windows `find` resolves to
 * `C:\Windows\system32\find.exe` (a *text search* tool with unrelated flags) and
 * `xargs` does not exist at all, so the command died with
 * "'xargs' is not recognized as an internal or external command" and exit 255.
 * CI runs on ubuntu-latest, which is why the breakage was never caught.
 *
 * WHAT IT DOES
 * ------------
 * 1. Syntax-checks every backend `.js` file (equivalent to the old `node --check`
 *    loop) by spawning `process.execPath --check <file>`.
 * 2. Runs each unit test file in its own child process, in a fixed order, so one
 *    suite's state cannot leak into the next.
 * 3. Exits 0 only if every step passed; otherwise exits 1 and prints a summary.
 *
 * Uses only Node built-ins, so it behaves identically on Windows, macOS and Linux.
 *
 * Usage: node scripts/run-tests.js
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');

/** Directories whose `.js` files are syntax-checked. `node_modules` is excluded. */
const SYNTAX_CHECK_DIRS = ['middleware', 'models', 'routes', 'services', 'utils', 'scripts', 'test'];

/** Standalone entry point that is also syntax-checked. */
const SYNTAX_CHECK_FILES = ['server.js', 'db.js'];

/**
 * Unit and integration test files, executed in this order (each in its own
 * process so state cannot leak between suites).
 *
 * `security-integration.test.js` boots the real server and needs MongoDB; it
 * skips cleanly (exit 0) when the database is unreachable, matching
 * `auth-middleware.test.js`.
 */
const TEST_FILES = [
  'test/request-sanitize.test.js',
  'test/transaction-timezone.test.js',
  'test/taxEngine.test.js',
  'test/pagination.test.js',
  'test/auth-middleware.test.js',
  'test/security-integration.test.js',
];

/**
 * Extra environment for specific test files.
 *
 * `security-integration.test.js` asserts live `req.query` sanitization through
 * the real HTTP stack, which needs the opt-in diagnostic echo route registered
 * on the child server. It is hard-disabled in production inside server.js.
 */
const TEST_ENV = {
  'test/security-integration.test.js': { ENABLE_DIAGNOSTIC_ECHO: 'true' },
};

/**
 * Recursively collect `.js` files under `dir`.
 *
 * @param {string} dir Absolute directory to walk.
 * @returns {string[]} Absolute file paths, excluding `node_modules`.
 */
function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Run a Node script and inherit stdio so output streams live.
 *
 * @param {string[]} args Arguments passed to the current Node executable.
 * @param {string} label Human-readable step name.
 * @returns {boolean} True when the child exited 0.
 */
function runNode(args, label, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });

  if (result.error) {
    console.error(`✗ ${label} could not start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`✗ ${label} failed (exit ${result.status})`);
    return false;
  }
  return true;
}

function main() {
  const failures = [];

  // ── 1. Syntax checks ──────────────────────────────────────────────────────
  const syntaxTargets = [
    ...SYNTAX_CHECK_FILES.map((rel) => path.join(BACKEND_ROOT, rel)),
    ...SYNTAX_CHECK_DIRS.flatMap((rel) => collectJsFiles(path.join(BACKEND_ROOT, rel))),
  ].filter((file) => fs.existsSync(file));

  console.log(`\n── Syntax check: ${syntaxTargets.length} file(s) ──`);
  for (const file of syntaxTargets) {
    const rel = path.relative(BACKEND_ROOT, file);
    if (!runNode(['--check', file], `node --check ${rel}`)) {
      failures.push(`syntax: ${rel}`);
    }
  }

  // ── 2. Unit tests ─────────────────────────────────────────────────────────
  console.log(`\n── Unit tests: ${TEST_FILES.length} suite(s) ──`);
  for (const rel of TEST_FILES) {
    const abs = path.join(BACKEND_ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`✗ ${rel} is missing`);
      failures.push(`missing: ${rel}`);
      continue;
    }
    console.log(`\n▶ ${rel}`);
    if (!runNode([abs], rel, TEST_ENV[rel] || {})) {
      failures.push(rel);
    }
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  if (failures.length > 0) {
    console.error(`✗ ${failures.length} step(s) failed:`);
    for (const failure of failures) console.error(`   - ${failure}`);
    console.error('════════════════════════════════════════\n');
    process.exit(1);
  }

  console.log(`✓ All checks passed (${syntaxTargets.length} syntax, ${TEST_FILES.length} suites)`);
  console.log('════════════════════════════════════════\n');
}

main();
