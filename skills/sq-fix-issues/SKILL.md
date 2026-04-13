# SI Referee v2 — Orchestrator (Enhanced v3)

## Trigger
`/sq-fix-issues [--rule RULE_ID] [--tier 1|2|3] [--limit N] [--dry]`

> Requires: SonarQube MCP Server connected. No CSV exports. No prepare-context. MCP is the live source of truth.

---

## Auto-Skip Rules (never enter the queue)
```
javascript:S100   — naming convention (team-specific)
javascript:S1192  — string literal duplication (too noisy)
```

---

## Tier Classification

### TIER 1 — Codemod / Silent
| Rule | Count | Fix Tool | Transform | Notes |
|------|-------|----------|-----------|-------|
| javascript:S6507 | ~0 | jscodeshift | `window-to-globalthis.js` | done |
| javascript:S6777 | ~0 | jscodeshift | `window-to-globalthis.js` | done |
| javascript:S7764 | 11 | jscodeshift | `window-to-globalthis.js` | |
| javascript:S3504 | 11 | jscodeshift | `no-var.js` | |
| javascript:S2737 | — | jscodeshift | `fix-empty-catch.js` | |
| javascript:S1116 | — | ESLint --fix | `no-empty-stmt.js` | |
| javascript:S1764 | — | jscodeshift | `no-identical-expr.js` | |
| javascript:S6606 | — | jscodeshift | `no-typo-op.js` | |
| javascript:S1940 | 7 | jscodeshift | `eqeqeq.js` | |
| javascript:S3403 | 3 | jscodeshift | `eqeqeq.js` | |
| javascript:S7781 | 104 | jscodeshift | `replaceall.js` | |
| javascript:S6582 | 155 | jscodeshift | `optional-chain.js` | |
| javascript:S7773 | 28 | jscodeshift | `number-parseint.js` | extend: isNaN→Number.isNaN |
| javascript:S7761 | 68 | jscodeshift | `dataset.js` | NEW — skip camelCase attrs |
| javascript:S6644 | 65 | jscodeshift | `nullish-default.js` | NEW — x?x:y → x??y |
| javascript:S6509 | 27 | jscodeshift | `no-double-negation.js` | NEW — !!x → x |
| javascript:S1125 | 29 | jscodeshift | `no-bool-literal.js` | NEW — !!cond → cond |
| javascript:S7759 | 29 | jscodeshift | `date-now.js` | NEW — new Date() → Date.now() |
| javascript:S7740 | 32 | jscodeshift | `no-self-assign.js` | NEW — self=this removal |
| javascript:S6325 | 33 | jscodeshift | `regexp-literal.js` | NEW — new RegExp→literal |
| javascript:S6353 | 33 | jscodeshift | `regexp-literal.js` | NEW — char class shortcuts |
| javascript:S7765 | 16 | jscodeshift | `array-methods.js` | NEW — .some(x=>x===v)→.includes |
| javascript:S7754 | 17 | jscodeshift | `array-methods.js` | NEW — .find(truthiness)→.some |
| javascript:S7755 | 10 | jscodeshift | `array-methods.js` | NEW — arr[len-1]→.at(-1) |
| javascript:S7750 | 9 | jscodeshift | `array-methods.js` | NEW — .filter()[0]→.find() |
| javascript:S3626 | 7 | jscodeshift | `no-redundant-jump.js` | NEW — redundant return/break |
| javascript:S7767 | 6 | jscodeshift | `math-methods.js` | NEW — ~~x→Math.trunc |
| javascript:S7766 | 6 | jscodeshift | `math-methods.js` | NEW — ternary→Math.max/min |
| javascript:S7762 | 3 | jscodeshift | `dom-methods.js` | NEW — removeChild→remove() |
| javascript:S1128 | 5 | jscodeshift | `no-unused-imports.js` | |
| javascript:S1126 | — | jscodeshift | `return-boolean.js` | |

### TIER 2 — Batch Confirm (one confirmation per rule family)
| Rule | Count | Description |
|------|-------|-------------|
| javascript:S125 | 546 | Commented-out code (JS) |
| javascript:S1121 | 94 | Assignment inside condition |
| javascript:S7735 | 77 | Negated condition — invert logic |
| javascript:S6535 | 63 | Unnecessary escape char in regex |
| javascript:S4138 | 33 | `for` loop → `for-of` |
| javascript:S6660 | 30 | `if` as only stmt in block |
| javascript:S7778 | 17 | Multiple `.push()` → spread push |
| javascript:S1788 | 17 | Default params should be last |
| javascript:S1871 | 13 | Same code in both branches |
| javascript:S1854 | 119 | Useless assignment |
| javascript:S1481 | 111 | Unused local variable |
| javascript:S905 | 72 | Expression with no side effect |
| javascript:S3358 | 110 | Nested ternary |
| javascript:S4043 | 8 | Array .reverse() on same ref |
| javascript:S6594 | 7 | Use `RegExp.exec()` |
| javascript:S4144 | 26 | Duplicate function implementation |
| javascript:S1172 | — | Unused function parameter |
| javascript:S1135 | — | TODO comments |
| javascript:S7761 (camelCase) | ~42 | dataset with camelCase attr names |

### TIER 3 — Human Review (per issue)
| Rule | Count | Reason |
|------|-------|--------|
| javascript:S3796 | 4 | **BLOCKER** — missing return in callback |
| javascript:S2703 | 2 | **BLOCKER** — implicit global variable |
| javascript:S930 | 2 | **CRITICAL** — wrong argument count |
| Web:S7930 | 31 | **CRITICAL** — duplicate element IDs |
| javascript:S3776 | — | Cognitive complexity — real refactor |
| javascript:S1067 | — | Expression complexity — logic restructure |
| javascript:S2201 | 7 | Return value of map/reduce ignored |
| javascript:S1534 | 15 | Duplicate variable/function name |
| javascript:S3800 | 10 | Function inconsistent return type |
| javascript:S5852 | — | Regex DoS — security |
| javascript:S6019 | 2 | Regex — security |
| javascript:S4830 | — | Certificate validation — security |
| javascript:S2083 | — | Path injection — security |
| javascript:S2076 | — | OS command injection — security |
| Any `SecurityHotspot` | — | Always human |
| Any `BLOCKER` severity | — | Always human |

---

## State File: `.sonarqube_fix_progress.json`
Create if missing:
```json
{
  "last_updated": null,
  "build_command": "npm run lint",
  "rule_families": []
}
```
Each completed rule appends to `rule_families[]`:
```json
{
  "rule": "javascript:S6507",
  "tier": 1,
  "method": "codemod",
  "status": "fixed|codemod-failure|build-failure|skipped",
  "count": 0,
  "timestamp": "<ISO>",
  "notes": ""
}
```
Append-only. Never overwrite previous entries.

---

## Step 1 — Fetch Issues
```
sonarqube_get_issues({ projectKey: <from config.json CLIENT>, statuses: "OPEN", ps: 500 })
```
If `--rule` flag: add `rules: RULE_ID` to filter.
If `--tier` flag: only process rules in that tier.

Filter out:
- Auto-skip rules
- Files matching: `node_modules`, `dist`, `/static/`, `.min.js`

Group remaining issues by `rule` key. Print preflight summary:
```
📋 Issues fetched from SonarQube
---------------------------------
Total open issues  : X
Tier 1 (codemod)   : X  ← zero prompts
Tier 2 (batch AI)  : X  ← one confirmation per rule family
Tier 3 (review)    : X  ← per-issue developer decision
Auto-skip          : X  ← excluded

Starting Tier 1 codemod run...
```

---

## Step 2 — Skip Already-Fixed Rules
Load `.sonarqube_fix_progress.json`. Skip any rule where `status === "fixed"`.
Resume from next pending rule family.

---

## Step 3 — Tier 1: Run Codemods Silently

For each Tier 1 rule family:
1. Extract file paths: `issue.component` → strip `projectKey:` prefix
2. Run (respecting `--dry`):
   ```
   node codemods/runner.js --rule RULE_ID --files FILE1,FILE2,... [--dry]
   ```
3. If `--dry`: print what would change, stop here
4. If not `--dry`: after all Tier 1 codemods complete, run build once:
   ```
   npm run lint 2>&1 | tail -20
   ```

**PASS:** commit all Tier 1 changes together:
```
git add <only changed files>
git commit -m "fix(sonar): tier 1 codemods — N files"
```
Append `status: "fixed"` entries to progress JSON for all Tier 1 rules.

**FAIL — Bisect to isolate culprit:**
Roll back: `git checkout -- .`
Re-run codemods one at a time in this order (safest → riskiest):
1. `fix-empty-catch` — annotation only, cannot break build
2. ESLint fixes — well-tested, low risk
3. `no-var` — scope-aware but hoisting edge cases possible
4. `window-to-globalthis` — safe for browser-only, risk if Node env

First one that breaks the build is the culprit.
Roll it back: `git checkout -- .`
Log as `status: "codemod-failure"` with notes explaining which file/rule.
Continue with remaining Tier 1 codemods and proceed to Tier 2.

---

## Step 4 — Tier 2: Batch Confirm (one confirmation per rule family)

For each Tier 2 rule family:
1. Take first 5 issues as sample
2. Call classifier skill: `{ rule, sample: [[key, file, line, snippet], ...] }`
3. **If `safe: false`** → move entire rule family to Tier 3 queue. Continue.
4. **If `safe: true`** → AI fixes all instances. Show one summary:

```
📋 Tier 2 — Batch Review
--------------------------
Rule     : javascript:S1172 (Unused function parameters)
Instances: 38 issues across 22 files

Sample fixes:
  src/utils/api.js:14   — removed unused `opts` from fetchData(url, opts)
  src/pages/Home.vue:88 — removed unused `event` from handleClick(event)
  ... (32 more similar)

⚠️  3 flagged — moved to Tier 3 queue automatically:
  src/middleware/auth.js:44 — Express signature (req, res, next)
  src/utils/legacy.js:12   — callback intent unclear

Apply remaining 35 fixes? [yes / no / review individually]
```

- `yes` → apply fixes, run `npm run lint`, on PASS commit + mark resolved, on FAIL rollback + log `build-failure`
- `no` → log `status: "skipped"`
- `review individually` → escalate to Tier 3 behavior for this rule only

---

## Step 5 — Tier 3: Human Review (per issue)

Call review-presenter skill. Developer decides per issue with `[f]ix / [s]kip / [B]atch skip / [q]uit`.

After each accepted fix: run `npm run lint 2>&1 | tail -5`.
On failure: `git checkout -- <file>`, log as `build-failure`, continue to next issue.
Never auto-commit Tier 3 fixes — developer commits manually.

---

## Step 6 — Update Dashboard Data

After every session (even partial), update `sq-dashboard-data.json`:

1. Fetch fresh counts from SonarQube:
   ```
   sonarqube_get_issues({ componentKeys: "FIH-NUXT", statuses: "OPEN", ps: 1 }) → paging.total
   sonarqube_get_issues({ ... rules: "javascript:S3776", ... }) → per-rule totals for reliability/maintainability
   ```
2. Read current `sq-dashboard-data.json`
3. Update these fields:
   - `current.reliability`, `current.maintainability`, `current.totalIssues` — from fresh SonarQube fetch
   - `generatedAt` — today's date
   - For each rule processed this session: update `issuesFixed`, `filesChanged`, `status`, `classifierResult`, `classifierReason`, `notes` in `tier1.rules[]` or `tier2.rules[]`
   - Append new entries to `tier3_queue[]` for any rules escalated this session
   - Append new codemods to `codemodInventory[]` if new transforms were written
   - Append new commit hashes to `commits[]`
4. Write updated `sq-dashboard-data.json`
5. `git add sq-dashboard-data.json` — include in the session commit

The HTML dashboard (`sq-dashboard.html`) reads this JSON at load time — no HTML edits needed, data update is enough.

---

## Step 7 — Final Report

```
🏁 SonarQube Fix Session Complete
=====================================
Tier 1 — codemod silent     : X ✅
Tier 2 — batch confirmed    : X ✅
Tier 3 — human reviewed     : X ✅
Skipped by developer        : X ⚠️
Codemod failures (rolled back): X ❌
Build failures (rolled back): X ❌

Rules needing manual follow-up:
  <rule> — <reason> → add to sonar-project.properties exclusions if needed

Total resolved this session  : X
Remaining open in SonarQube  : X
Dashboard updated             : sq-dashboard-data.json ✅
→ Run /sq-fix-issues again to continue
```

---

## Global Constraints
- Tier 1 codemods: never prompt the developer
- Tier 2: one prompt per rule family, never per issue
- Never commit directly to main/master — fixes on current feature branch only
- Never rewrite entire files — targeted changes only
- Never change exported function signatures without explicit Tier 3 confirmation
- Never auto-fix security hotspot rules — always Tier 3
- Always run `npm run lint` after each tier before marking resolved
- Always rollback cleanly on failure — never leave broken state
- Append-only progress JSON — never overwrite previous entries
- If codemod produces unexpected output, move that rule to Tier 3 for this session
- Max 50 files per codemod run unless `--limit` overrides
