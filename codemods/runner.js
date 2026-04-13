#!/usr/bin/env node
/**
 * SI Referee v2 — Codemod Runner CLI
 * Usage: node codemods/runner.js --rule javascript:S3504 --files file1.js,file2.js [--dry]
 *        node codemods/runner.js --rule javascript:S3504 --all [--dry]
 *
 * Reads registry.json, resolves the codemod, runs jscodeshift.
 * .vue files: extracts <script> block → temp .js → codemod → reinsert.
 * Prints a compact summary: files changed / files unchanged / errors.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
  const result = spawnSync('git', ['ls-files', '--', '*.js', '*.vue'], { cwd: ROOT, encoding: 'utf8' });
  files = result.stdout.trim().split('\n').filter(Boolean);
}

if (files.length === 0) {
  console.error('No files specified. Use --files f1,f2 or --all');
  process.exit(1);
}

// Resolve to absolute paths
files = files.map((f) => (path.isAbsolute(f) ? f : path.join(ROOT, f)));

// Split into JS and Vue
const jsFiles  = files.filter(f => !f.endsWith('.vue'));
const vueFiles = files.filter(f => f.endsWith('.vue'));

console.log(`\n[referee] Rule: ${args.rule} (${entry.desc})`);
console.log(`[referee] Codemod: ${entry.codemod}`);
console.log(`[referee] Files: ${files.length} (${jsFiles.length} JS + ${vueFiles.length} Vue)`);
console.log(`[referee] Mode: ${args.dry ? 'DRY RUN' : 'APPLY'}\n`);

let totalOk = 0, totalUnmod = 0, totalErrors = 0, totalSkipped = 0;

// ─── Run jscodeshift on plain JS files ───────────────────────────────────────
if (jsFiles.length > 0) {
  const jscsArgs = [
    'jscodeshift',
    '--no-babel',
    '-t', codemodPath,
    ...(args.dry ? ['--dry'] : []),
    ...jsFiles,
  ];

  const result = spawnSync('npx', jscsArgs, {
    cwd: ROOT, stdio: 'pipe', encoding: 'utf8',
  });

  const output = result.stdout + result.stderr;
  process.stdout.write(output);

  totalOk      += parseNum(output, /^(\d+) ok$/m);
  totalUnmod   += parseNum(output, /^(\d+) unmodified$/m);
  totalErrors  += parseNum(output, /^(\d+) errors?$/m);
  totalSkipped += parseNum(output, /^(\d+) skipped$/m);
}

// ─── Run codemod on Vue files via script-block extraction ────────────────────
if (vueFiles.length > 0) {
  const SCRIPT_RE = /(<script(?:\s[^>]*)?>)([\s\S]*?)(<\/script>)/;
  const tmpDir = os.tmpdir();

  for (const vuePath of vueFiles) {
    try {
      const src = fs.readFileSync(vuePath, 'utf8');

      // Match first <script> block (non-greedy)
      const scriptMatch = src.match(SCRIPT_RE);
      if (!scriptMatch) { totalUnmod++; continue; }

      const [fullMatch, openTag, scriptBody, closeTag] = scriptMatch;

      // Write script body to temp file
      const tmpFile = path.join(tmpDir, `vue_script_${Date.now()}.js`);
      fs.writeFileSync(tmpFile, scriptBody, 'utf8');

      // Run jscodeshift CLI on the temp file
      const dryFlag = args.dry ? ['--dry'] : [];
      const jsResult = spawnSync('npx', [
        'jscodeshift', '--no-babel', '-t', codemodPath, ...dryFlag, tmpFile
      ], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });

      const jsOutput = jsResult.stdout + jsResult.stderr;
      const ok = parseNum(jsOutput, /^(\d+) ok$/m);
      const errs = parseNum(jsOutput, /^(\d+) errors?$/m);

      if (errs > 0) {
        const errLine = jsOutput.match(/ ERR .+ (.+)/);
        console.error(` ERR ${vuePath} (jscodeshift): ${errLine ? errLine[1] : 'parse error'}`);
        fs.unlinkSync(tmpFile);
        totalErrors++;
        continue;
      }

      if (ok === 0) {
        // No changes
        fs.unlinkSync(tmpFile);
        totalUnmod++;
        continue;
      }

      if (args.dry) {
        console.log(` DRY ${vuePath} — would change`);
        fs.unlinkSync(tmpFile);
        totalOk++;
        continue;
      }

      // Read the transformed script body
      const newBody = fs.readFileSync(tmpFile, 'utf8');
      fs.unlinkSync(tmpFile);

      if (newBody === scriptBody) {
        totalUnmod++;
        continue;
      }

      // Re-insert into Vue file
      const newSrc = src.replace(fullMatch, openTag + newBody + closeTag);
      if (newSrc === src) {
        // Replace failed to match — log and skip to avoid corruption
        console.error(` ERR ${vuePath}: script-block replace failed (content mismatch)`);
        totalErrors++;
        continue;
      }

      fs.writeFileSync(vuePath, newSrc, 'utf8');
      console.log(` ok  ${vuePath}`);
      totalOk++;
    } catch (e) {
      console.error(` ERR ${vuePath}: ${e.message}`);
      totalErrors++;
    }
  }
}

console.log(`\n[referee] Summary: ${totalOk} changed | ${totalUnmod} unchanged | ${totalSkipped} skipped | ${totalErrors} errors`);

if (!args.dry && totalOk > 0) {
  updateProgress(args.rule, files, totalOk);
  console.log(`[referee] Progress saved to sq-progress.json`);
}

process.exit(totalErrors > 0 ? 1 : 0);

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseNum(str, regex) {
  const m = str.match(regex);
  return m ? Number.parseInt(m[1]) : 0;
}

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
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch (e) {
      void 0;
    }
  }
  progress.lastRun = new Date().toISOString();
  progress.byRule = progress.byRule || {};
  progress.byRule[rule] = progress.byRule[rule] || { fixed: 0, runs: 0 };
  progress.byRule[rule].fixed += changedCount;
  progress.byRule[rule].runs += 1;
  progress.byRule[rule].lastCodemod = REGISTRY[rule].codemod;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}
