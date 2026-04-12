#!/usr/bin/env node
/**
 * SI Referee v2 — Codemod Runner CLI
 * Usage: node codemods/runner.js --rule javascript:S3504 --files file1.js,file2.js [--dry]
 *        node codemods/runner.js --rule javascript:S3504 --all [--dry]
 *
 * Reads registry.json, resolves the codemod, runs jscodeshift.
 * Prints a compact summary: files changed / files unchanged / errors.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = require('./registry.json');
const PROGRESS_FILE = path.join(ROOT, 'sq-progress.json');

const args = parseArgs(process.argv.slice(2));

if (!args.rule) {
  console.error('Usage: node codemods/runner.js --rule <sonar-rule-id> --files <f1,f2> [--dry]');
  process.exit(1);
}

const entry = REGISTRY[args.rule];
if (!entry) {
  console.error(`Rule ${args.rule} not in registry`);
  process.exit(1);
}
if (!entry.codemod) {
  console.error(`Rule ${args.rule} is Tier ${entry.tier} — no codemod available, use review-presenter`);
  process.exit(1);
}

const codemodPath = path.join(__dirname, 'rules', `${entry.codemod}.js`);
if (!fs.existsSync(codemodPath)) {
  console.error(`Codemod file not found: ${codemodPath}`);
  process.exit(1);
}

let files = [];
if (args.files) {
  files = args.files.split(',').map((f) => f.trim()).filter(Boolean);
} else if (args.all) {
  // Collect all JS/Vue files (excluding node_modules, dist, static)
  const result = spawnSync('git', ['ls-files', '--', '*.js', '*.vue'], { cwd: ROOT, encoding: 'utf8' });
  files = result.stdout.trim().split('\n').filter(Boolean);
}

if (files.length === 0) {
  console.error('No files specified. Use --files f1,f2 or --all');
  process.exit(1);
}

// Resolve to absolute paths
files = files.map((f) => (path.isAbsolute(f) ? f : path.join(ROOT, f)));

const jscsArgs = [
  'jscodeshift',
  '--no-babel',
  '-t', codemodPath,
  ...(args.dry ? ['--dry'] : []),
  '--extensions', 'js,vue',
  ...files,
];

console.log(`\n[referee] Rule: ${args.rule} (${entry.desc})`);
console.log(`[referee] Codemod: ${entry.codemod}`);
console.log(`[referee] Files: ${files.length}`);
console.log(`[referee] Mode: ${args.dry ? 'DRY RUN' : 'APPLY'}\n`);

const result = spawnSync('npx', jscsArgs, {
  cwd: ROOT,
  stdio: 'pipe',
  encoding: 'utf8',
});

const output = result.stdout + result.stderr;
console.log(output);

// Parse jscodeshift output (multi-line format: "N ok", "N unmodified", "N errors")
const okMatch = output.match(/^(\d+) ok$/m);
const unmodMatch = output.match(/^(\d+) unmodified$/m);
const errMatch = output.match(/^(\d+) errors?$/m);
const skippedMatch = output.match(/^(\d+) skipped$/m);

const ok = okMatch ? parseInt(okMatch[1]) : 0;
const unmod = unmodMatch ? parseInt(unmodMatch[1]) : 0;
const errors = errMatch ? parseInt(errMatch[1]) : 0;
const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

console.log(`\n[referee] Summary: ${ok} changed | ${unmod} unchanged | ${skipped} skipped | ${errors} errors`);

if (!args.dry && ok > 0) {
  updateProgress(args.rule, files, ok);
  console.log(`[referee] Progress saved to sq-progress.json`);
}

process.exit(result.status || 0);

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function updateProgress(rule, files, changedCount) {
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch (e) {}
  }
  progress.lastRun = new Date().toISOString();
  progress.byRule = progress.byRule || {};
  progress.byRule[rule] = progress.byRule[rule] || { fixed: 0, runs: 0 };
  progress.byRule[rule].fixed += changedCount;
  progress.byRule[rule].runs += 1;
  progress.byRule[rule].lastCodemod = REGISTRY[rule].codemod;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}
