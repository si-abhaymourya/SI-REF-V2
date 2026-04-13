# sq-fix-issues (Orchestrator)

# AI Command: sq-fix-issues (Enhanced v2)
> Replaces: sq-prepare-context, sq-progress-manager, sq-fix-issues (old)
> Requires: SonarQube MCP Server connected in IDE/CLI

---

## Philosophy

This command is the **only command you need**.

- No CSV exports. No shell scripts. No prepare-context. No progress-manager.
- SonarQube MCP is the live source of truth — issues fetched, fixed, and resolved directly.
- Rules fetched from MCP — no local rules CSV needed.
- Issues processed **by rule family** — entire batches fixed at once, not one-by-one.
- **Three fix tiers** — silent codemod / batch confirm / human review. Nothing in between.
- Build + tests run automatically after each rule family. Failures trigger automatic rollback.
- Developer is interrupted only when genuinely necessary.

---

## Fix Tier System

Every rule is assigned exactly one tier. The tier determines how much developer attention it needs.

```
TIER 1 — CODEMOD / SILENT
  Tool  : jscodeshift transform or ESLint --fix
  Ask   : Never.
  When  : Mechanical AST substitution. Identical fix every time. Zero ambiguity.
  Scale : Handles 1,500+ instances without a single prompt.

TIER 2 — BATCH CONFIRM
  Tool  : AI fixes all instances, shows one summary, asks once
  Ask   : Once per rule family (not once per issue)
  When  : Fix pattern is consistent but a human glance adds value before committing

TIER 3 — HUMAN REVIEW
  Tool  : AI proposes, developer decides per issue
  Ask   : Every issue
  When  : Logic changes, security decisions, complexity refactors
```

---

## Pre-Flight: Rule Classification Table

### TIER 1 — Codemod / Silent (AST-powered, zero prompts)

| Rule | Description | Fix Tool | Transform |
|---|---|---|---|
| javascript:S6507 | `window` → `globalThis` | jscodeshift | `window-to-globalthis.js` |
| javascript:S3504 | `var` → `let` or `const` | jscodeshift | `no-vars.js` (scope-aware) |
| javascript:S2737 | Empty catch block | jscodeshift | `fix-empty-catch.js` |
| javascript:S1116 | Empty statement (lone `;`) | ESLint --fix | `no-empty` |
| javascript:S1128 | Unused import/require | ESLint --fix | `no-unused-vars` |
| javascript:S1481 | Unused local variable | ESLint --fix | `no-unused-vars` |
| javascript:S125  | Commented-out code | ESLint --fix | `no-commented-out-code` |
| javascript:S1110 | Redundant parentheses | ESLint --fix | `no-extra-parens` |

> **Why AST/codemod instead of AI for these?**
> A 1,500-instance `window → globalThis` run takes ~3 seconds with jscodeshift.
> With AI: ~2,000 × 500 tokens = 1,000,000 tokens + developer verification time.
> AST is deterministic, scope-aware, and faster by orders of magnitude.
> These are not intelligence problems. They are text transformation problems.

---

### TIER 2 — Batch Confirm (AI fixes all, one confirmation per rule family)

| Rule | Description | Why Tier 2 (not Tier 1) |
|---|---|---|
| javascript:S1854 | Useless assignment | Might be intentional pattern in some codebases |
| javascript:S1172 | Unused function parameter | Could be Express/event callback signature |
| javascript:S1488 | Simplify return statement | Style preference — worth one glance |
| javascript:S4144 | Duplicate function | Verify intent before removing |
| javascript:S2966 | Unnecessary null check | May be defensive programming preference |
| javascript:S6326 | Redundant regex flags | Verify regex intent before modifying |
| javascript:S1135 | TODO comments | Team may want to triage, not auto-delete |

---

### TIER 3 — Human Review (per issue, developer decides)

| Rule | Reason |
|---|---|
| javascript:S3776 | Cognitive complexity — real refactor needed |
| javascript:S1067 | Expression complexity — logic restructure |
| javascript:S2201 | Return value ignored — likely intentional |
| javascript:S5852 | Regex DoS — security risk assessment required |
| javascript:S6019 | Regex — security risk |
| javascript:S4830 | Certificate validation — security decision |
| javascript:S2083 | Path injection — security |
| javascript:S2076 | OS command injection — security |
| Any `SecurityCategory` | All security hotspots — always human |
| Any `BLOCKER` severity | Too risky for automation |

---

### Auto-Skip (never enter the queue)

```
# Add rules your team has permanently decided to ignore:
# javascript:S100   — naming convention (team-specific)
# javascript:S1192  — string literal duplication (too noisy)
```

---

## Codemod Transforms (One-Time Setup)

On first run, the following transforms are generated and saved to `.sonarqube-codemods/`.
They are reused on every subsequent run. Never regenerated unless `/codemod regenerate` is called.

```bash
npm install -g jscodeshift   # one-time global install
```

---

### `window-to-globalthis.js` — S6507

```js
// Replaces bare `window` identifier with `globalThis`
// Skips property keys like { window: value }
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  return j(fileInfo.source)
    .find(j.Identifier, { name: 'window' })
    .filter(path => {
      // Skip if used as a property key: { window: ... }
      if (path.parent.node.type === 'Property' && path.parent.node.key === path.node) return false;
      return true;
    })
    .replaceWith(() => j.identifier('globalThis'))
    .toSource();
};
```

**Edge case:** `window.location`, `window.addEventListener` are browser-only APIs that
don't exist on `globalThis` in Node environments. For browser-only projects: fully safe.
For SSR / Node projects: exclude `src/server/` in `sonar-project.properties`.

---

### `no-vars.js` — S3504

```js
// Replaces var with const (if never reassigned) or let (if reassigned)
// Scope-aware — checks for reassignment before deciding const vs let
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  root.find(j.VariableDeclaration, { kind: 'var' }).forEach(path => {
    const isReassigned = path.node.declarations.some(declarator => {
      if (!declarator.id || declarator.id.type !== 'Identifier') return true; // conservative
      const name = declarator.id.name;
      let reassigned = false;
      j(path.parent).find(j.AssignmentExpression).forEach(assign => {
        if (assign.node.left.type === 'Identifier' && assign.node.left.name === name) {
          reassigned = true;
        }
      });
      return reassigned;
    });
    path.node.kind = isReassigned ? 'let' : 'const';
  });

  return root.toSource();
};
```

**Edge case:** `var` inside loops relying on function-scoped hoisting may break with `let`.
The transform defaults to `let` (never `const`) when scope analysis is uncertain — which
is always safe. The build step immediately after catches any hoisting edge cases.
If build fails → roll back `src/legacy/` and add it to `sonar-project.properties` exclusions.

---

### `fix-empty-catch.js` — S2737

```js
// Annotates empty catch blocks instead of deleting them
// Deleting changes exception propagation — annotation is safer
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  return j(fileInfo.source)
    .find(j.CatchClause)
    .filter(path => path.node.body.body.length === 0)
    .forEach(path => {
      const comment = j.expressionStatement(
        j.identifier('/* intentionally empty — add error handling if needed */')
      );
      path.node.body.body = [comment];
    })
    .toSource();
};
```

**Why annotate instead of delete?** Deleting a catch block changes exception propagation.
An empty catch silently swallows errors. Annotating satisfies the SonarQube rule, makes
it visible in code review, and does not change runtime behaviour.
The annotation is a prompt for the developer to add real error handling in a future PR.

---

## Full Workflow

### Step 1 — Fetch Issues via MCP

```
MCP: sonarqube.getIssues({ projectKey: "<your-project-key>", status: "OPEN" })
```

Filter out Auto-Skip rules and `sonar-project.properties` exclusion paths.
Split remaining issues into three queues.

```
📋 Issues fetched from SonarQube
---------------------------------
Total open issues  : 2,441
Tier 1 (codemod)   : 2,198  ← jscodeshift + ESLint, zero prompts
Tier 2 (batch AI)  :   148  ← one confirmation per rule family
Tier 3 (review)    :    62  ← per-issue developer decision
Auto-skip          :    33  ← excluded, not processed

Starting Tier 1 codemod run...
```

---

### Step 2 — Tier 1: Run Codemods Silently

Run each codemod across the entire codebase. No prompts. No summaries during execution.

```bash
# S6507 — window → globalThis
jscodeshift -t .sonarqube-codemods/window-to-globalthis.js src/

# S3504 — var → let/const (scope-aware)
jscodeshift -t .sonarqube-codemods/no-vars.js src/

# S2737 — empty catch blocks
jscodeshift -t .sonarqube-codemods/fix-empty-catch.js src/

# S1116, S1128, S1481, S1110, S125 — ESLint auto-fix
eslint src/ --fix --rule '{"no-empty":"error","no-unused-vars":"error","no-extra-parens":"error"}'
```

After all Tier 1 codemods complete → run build + tests once:

```bash
npm run build && npm test
```

**PASS:**
```
⚡ Tier 1 complete — 1,598 issues fixed silently
   Build passed ✅
   Marking all Tier 1 issues resolved via MCP...
   Proceeding to Tier 2...
```

**FAIL — Bisect to isolate:**

Run codemods individually in this order (safest to riskiest):
1. `fix-empty-catch` — annotation only, cannot break build
2. ESLint fixes — well-tested, low risk
3. `no-vars` — scope-aware but hoisting edge cases possible
4. `window-to-globalthis` — safe for browser-only, risk if Node env

First one that breaks the build is the culprit.
Roll it back: `git checkout src/`
Log as `codemod-failure` in progress JSON.
Continue with remaining Tier 1 codemods and Tier 2.

---

### Step 3 — Tier 2: Batch AI Fix (one confirmation per rule family)

AI fixes all instances of a rule family and shows one summary:

```
📋 Tier 2 — Batch Review
--------------------------
Rule     : javascript:S1172 (Unused function parameters)
Instances: 38 issues across 22 files

Sample fixes:
  src/utils/api.js:14       — removed unused `opts` from `fetchData(url, opts)`
  src/pages/Home.vue:88     — removed unused `event` from `handleClick(event)`
  src/store/auth.js:201     — removed unused `ctx` from `middleware(ctx, next)`
  ... (32 more similar)

⚠️  3 flagged — moved to Tier 3 queue automatically:
  src/middleware/auth.js:44 — `(req, res, next)` Express signature
  src/utils/legacy.js:12   — callback intent unclear
  src/hooks/useForm.js:33  — param used via `arguments` object

Apply remaining 35 fixes? [yes / no / review individually]
```

One prompt. Not 35.
`review individually` → drops to Tier 3 behavior for this rule only.

After confirmation → run build + tests:
- PASS → mark 35 issues resolved in SonarQube via MCP
- FAIL → git stash, log `build-failure`, continue to next rule family

---

### Step 4 — Tier 3: Human Review (per issue)

```
🔍 Review Required
--------------------
Rule     : javascript:S3776
File     : src/pages/Dashboard.vue:312
Severity : CRITICAL
Message  : Cognitive Complexity is 24 (allowed: 15)

[code excerpt lines 305–325]

Suggested fix:
  Extract lines 315–320 into `handleFilterLogic()`.
  Reduces complexity: 24 → 11. No API changes. No side effects.

[proposed code snippet]

Do you want to apply this fix? [yes / no / skip]
```

- `yes` → apply, build, mark resolved via MCP if pass
- `no` → "Mark as won't-fix or leave pending?" — log accordingly
- `skip` → stays open in SonarQube, logged as skipped

---

### Step 5 — Update Dashboard Data

After every session (even partial), update `sq-dashboard-data.json`:

1. Fetch fresh totals from SonarQube MCP:
   - `current.totalIssues` — total open issues
   - `current.reliability`, `current.maintainability` — from type-filtered counts
2. Read existing `sq-dashboard-data.json`
3. Update fields:
   - `generatedAt` — today's date
   - `current.*` — fresh SonarQube counts
   - Per-rule entries in `tier1.rules[]` / `tier2.rules[]` — `issuesFixed`, `filesChanged`, `status`, `classifierResult`, `classifierReason`, `notes`
   - `tier3_queue[]` — append newly escalated rules with reason
   - `codemodInventory[]` — append any new codemods written this session
   - `commits[]` — append new commit hashes
4. Write `sq-dashboard-data.json`
5. Include in session commit: `git add sq-dashboard-data.json`

The HTML dashboard (`sq-dashboard.html`) reads this JSON at load — no HTML edits needed.

---

### Step 6 — Final Report

```
🏁 SonarQube Fix Session Complete
=====================================
Tier 1 — codemod silent     : 2,198 ✅
Tier 2 — batch confirmed    :   131 ✅
Tier 3 — human reviewed     :    44 ✅
Skipped by developer        :    18 ⚠️
Codemod failures (rolled back):   4 ❌
Build failures (rolled back):     2 ❌

Rules needing manual follow-up:
  javascript:S3504 — hoisting conflict in src/legacy/
    → Add src/legacy/ to sonar-project.properties exclusions
  javascript:S6507 — Node env conflict in src/server/
    → Add src/server/ to sonar-project.properties exclusions

Total resolved this session  : 2,373
Remaining open in SonarQube  :    68
→ Run /sq-fix-issues again to continue
```

---

## Progress State

Stored in `.sonarqube_fix_progress.json`.
Tracks **rule families**, not individual lines — keeps the file small and fast to load.

```json
{
  "last_updated": "2025-11-11T14:23:00Z",
  "build_command": "npm run build && npm test",
  "codemod_path": ".sonarqube-codemods/",
  "rule_families": [
    {
      "rule": "javascript:S6507",
      "tier": 1,
      "method": "codemod",
      "status": "fixed",
      "count": 2000,
      "timestamp": "2025-11-11T14:05:00Z",
      "notes": "window → globalThis. Build passed."
    },
    {
      "rule": "javascript:S3504",
      "tier": 1,
      "method": "codemod",
      "status": "codemod-failure",
      "count": 156,
      "timestamp": "2025-11-11T14:08:00Z",
      "notes": "Hoisting conflict in src/legacy/. Rolled back. Exclude legacy/."
    },
    {
      "rule": "javascript:S1172",
      "tier": 2,
      "method": "ai-batch",
      "status": "fixed",
      "count": 35,
      "timestamp": "2025-11-11T14:15:00Z",
      "notes": "3 Express signatures moved to Tier 3."
    }
  ]
}
```

---

## Resuming a Session

Run `/sq-fix-issues` again at any time.

1. Load `.sonarqube_fix_progress.json`
2. Fetch fresh issue list from MCP
3. Skip all rule families already `fixed`
4. Resume from next `pending` rule family

---

## Manual Controls

```
/progress show            → Summary by tier: fixed / failed / pending
/progress export          → Export progress JSON as CSV
/progress clear           → Reset and start fresh
/review queue             → List all issues in Tier 3 queue
/build set <command>      → Change build+test command for this session
/codemod regenerate       → Regenerate .sonarqube-codemods/ transforms
/tier move <RULE> <1|2|3> → Override a rule's tier for this session
```

---

## sonar-project.properties Integration

Filter noise before it ever reaches the queue — zero tokens wasted on excluded issues.

```properties
sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/*.test.js,**/legacy/**

sonar.issue.ignore.multicriteria=e1,e2,e3
sonar.issue.ignore.multicriteria.e1.ruleKey=javascript:S3776
sonar.issue.ignore.multicriteria.e1.resourceKey=**/legacy/**

sonar.issue.ignore.multicriteria.e2.ruleKey=javascript:S1192
sonar.issue.ignore.multicriteria.e2.resourceKey=**

sonar.issue.ignore.multicriteria.e3.ruleKey=javascript:S1067
sonar.issue.ignore.multicriteria.e3.resourceKey=**/*.spec.js
```

---

## Global Constraints

- Tier 1 codemods run silently — never prompt the developer for these.
- Tier 2 batch fixes show one summary — never prompt per individual issue.
- Never commit directly to main/master — all fixes on a feature branch.
- Never rewrite entire files — targeted changes only.
- Never change exported function signatures without explicit Tier 3 confirmation.
- Never auto-fix async/await flow — always Tier 3.
- Never auto-fix security hotspot rules — always Tier 3.
- Always run build + tests after each tier before marking resolved in SonarQube.
- Always rollback cleanly on build failure — never leave a broken state.
- Append-only progress JSON — never overwrite previous entries.
- If a codemod produces unexpected output, move that rule to Tier 3 for this session.

---

## Token Efficiency vs Old Framework

| Scenario | Old framework | This version |
|---|---|---|
| 1,500 `window→globalThis` | ~1,000,000 tokens + 2,000 confirmations | 0 tokens — jscodeshift |
| 150 `var→let/const` | ~75,000 tokens + 150 confirmations | 0 tokens — jscodeshift |
| 80 unused imports | ~40,000 tokens + 80 confirmations | 0 tokens — ESLint --fix |
| prepare-context step | ~8,000–15,000 tokens | Eliminated |
| progress-manager step | ~3,000–5,000 tokens | Eliminated |
| **Total savings** | **~1,100,000+ tokens** | **~85–90% reduction** |

Token budget is now spent exclusively on Tier 2 summaries and Tier 3 reviews —
the only work that actually requires intelligence.

---

Summary:
1. Fetch issues from SonarQube MCP
2. Filter exclusions
3. Classify into tiers
4. Tier 1 → codemods
5. Tier 2 → classifier → codemod-runner
6. Tier 3 → review-presenter
7. Build + test after each stage
8. Rollback on failure
9. Update progress JSON
