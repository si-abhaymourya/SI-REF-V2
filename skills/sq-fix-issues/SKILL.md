# sq-fix-issues

## Trigger
`/sq-fix-issues [--rule RULE_ID] [--dry]`

> Requires: SonarQube MCP connected.

---

## Core Rules
- MCP is the live source of truth — no CSV, no upfront file loading
- Rule details fetched on-demand, cached per session (never fetched twice for same rule)
- Fix in batches of 15–20 → run build → pass: commit / fail: rollback
- If a rule has ≥ 5 instances and is mechanical → generate AST codemod (AI loops waste tokens)
- Security / BLOCKER / CRITICAL → human review always, never auto-fix

---

## Step 0 — Identify the Project (auto-detect, no asking unless necessary)

Run these checks in order, stop at the first match:

**Check 1 — `sonarqube-fix.config.json` in repo root:**
```json
{ "projectKey": "my-project", "buildCommand": "npm run build" }
```
If exists and `projectKey` is set → use it. Done.

**Check 2 — `sonar-project.properties` in repo root:**
```
sonar.projectKey=my-project
```
If exists → read `sonar.projectKey`. Done.

**Check 3 — Ask MCP to list all projects:**
```
sonarqube_search_projects()
→ returns [{ key, name }, ...]
```
Get the current repo directory name and the `name` field from `package.json` (or `pom.xml` `artifactId`, `go.mod` module name — whatever exists).
Compare against the MCP project list:
- If exactly one project name/key matches the repo name → use it silently
- If multiple possible matches → show the short list and ask once:
  > "Found these SonarQube projects — which one is this repo?
  > 1. my-project-frontend
  > 2. my-project-api
  > 3. something-else"

**After identifying the project:**
Write `sonarqube-fix.config.json` with the resolved key + detected build command so this detection never runs again for this repo:
```json
{
  "projectKey": "<resolved>",
  "buildCommand": "<detected>",
  "skipRules": []
}
```

**Build command detection** (if not already in config):

| File found in repo root | Default build command |
|---|---|
| `package.json` | `npm run build` |
| `pom.xml` | `mvn compile -q` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` / `requirements.txt` | `python -m pytest` |
| `*.csproj` / `*.sln` | `dotnet build` |
| None of the above | ask the user once |

---

## Step 1 — Fetch & Group

```
sonarqube_get_issues({ projectKey, statuses: "OPEN", ps: 500 })
```

Filter out:
- Rules in `skipRules[]` from config
- Files matching: `node_modules`, `dist`, `build`, `.min.js`
- Issues already `fixed` or `skipped` in `.sonarqube_fix_progress.json`

Group by rule key. Sort by instance count descending (highest first).

Update `sq-dashboard-data.json` → `session.status = "running"`, `session.currentStep = "fetching"`

Print:
```
📋 {projectKey} — {X} open issues across {Y} rule groups
   Batch size: 15–20 fixes → build → rollback on fail
```

---

## Step 2 — Per-Rule Loop

For each rule group:

### 2a — Skip if done
`.sonarqube_fix_progress.json` → if `fixed` or `skipped`, skip silently.

### 2b — Update session
`sq-dashboard-data.json` → `session.currentRule = ruleId`, `session.currentStep = "classifying"`

### 2c — Check registry
`codemods/registry.json` → if rule exists with non-null codemod → **Step 3 (codemod)**
Not in registry → 2d

### 2d — Fetch rule details (lazy, session-cached)
```
sonarqube_get_rule({ key: ruleId })
→ cache { type, severity, tags, description }
```
If MCP returns nothing: `WebSearch "SonarQube rule {ruleId}"` for fix intent.
Never fetch the same rule twice in a session.

### 2e — Classify
Call **classifier skill** → `{ mechanical: true/false, reason }`

| Condition | Path |
|---|---|
| mechanical + instances ≥ 5 | Step 3 — generate + run codemod |
| mechanical + instances < 5 | Step 4 — AI fix |
| not mechanical | Step 4 — AI fix with confirm |
| security / BLOCKER / CRITICAL | Step 5 — human review |

---

## Step 3 — Codemod Path

`session.currentStep = "running codemod"`

Call **codemod-runner skill**: `{ rule, description, language, sample, files }`

Codemod runner: check registry → use existing OR generate new → dry-run → apply.
Add changed files to batch counter.

---

## Step 4 — AI Fix Path

`session.currentStep = "ai fixing"`

For each issue in the rule group:

1. Read only the relevant lines at issue location (not the full file)
2. Show:
```
─────────────────────────────────────────
Rule  : {ruleId}
File  : {file}:{line}
Issue : {message}

{code ±3 lines}

Fix: {proposed minimal change}
─────────────────────────────────────────
[f]ix  [s]kip  [B]skip rule  [q]uit
```
3. On `f`: apply edit → increment batch counter

---

## Step 5 — Human Review Path

Call **review-presenter skill**. Developer decides per issue.
Never auto-apply. Never auto-commit.

---

## Step 6 — Batch Build (every 15–20 fixes)

Before batch: `git diff --name-only` → save as `batchFiles[]`

Run: `{buildCommand from config}`

**PASS:**
```
git add <batchFiles>
git commit -m "fix(sonar): batch {N} — {X} issues — {Y} files"
```
Append to `sq-dashboard-data.json → batches[]`: `{ n, issues, buildStatus: "pass", commit, timestamp }`
Reset `session.batchCounter = 0`

**FAIL:**
```
git checkout -- <batchFiles>
```
Append `{ buildStatus: "fail", commit: null }` to batches.
Log issues as `build-failure` in progress JSON.
If batch was 20: split into 10 + 10, retry each to isolate culprit.
Always continue to next batch — never stop the session.

---

## Step 7 — Update Dashboard

After each batch:
1. `current.total` ← `sonarqube_get_issues({ ps: 1 }) → paging.total`
2. Update each processed rule in `rules[]`
3. Recalculate tokens:
   - `used` = (codemods_generated × 600) + (ai_fixes × 400) + (rule_fetches × 300)
   - `naiveEstimate` = issues_fixed_this_session × 500
   - `saved` = naiveEstimate − used

---

## Step 8 — Final Report

```
🏁 Session Complete
====================
Codemod runs : {X} rules  ({Y} issues — ~0 tokens each)
AI fixes     : {X} issues (~400 tokens each)
Build fails  : {X} batches (rolled back cleanly)

Tokens used  : ~{X}k
Tokens saved : ~{X}k vs naive
Remaining    : {X} open in SonarQube
```

Set `session.status = "idle"`, `session.currentRule = null`, `session.currentStep = null`

---

## Global Constraints
- Never load full progress file or rule CSVs upfront
- Never rewrite entire files — targeted edits only
- Never commit to main/master
- Never auto-fix security hotspots or BLOCKER/CRITICAL
- Rollback is per-batch — one failure never stops the session
- Append-only progress JSON
- `sonarqube-fix.config.json` is written once on first run, read on every subsequent run
