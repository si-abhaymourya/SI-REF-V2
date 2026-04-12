# SI Referee v2 — Orchestrator

## Trigger
`/sq-fix-issues [--rule RULE_ID] [--tier 1|2|3] [--limit N] [--dry]`

## State
Read `sq-progress.json` at start. Create it if missing:
```json
{ "lastRun": null, "byRule": {}, "fixed": [], "skipped": [] }
```

## Step 1 — Fetch Issues
Use SonarQube MCP tool to fetch open issues.
```
sonarqube_get_issues({ project: <from config.json CLIENT>, statuses: "OPEN", ps: 500 })
```
If `--rule` flag: add `rules: RULE_ID` to filter.
Group results by `rule` key.

## Step 2 — Route by Registry
Load `codemods/registry.json`. For each rule group:
- **tier 1** → go to Step 3 (zero AI)
- **tier 2** → go to Step 4 (classify first)
- **tier 3** → go to Step 5 (human review)
- **not in registry** → skip, log to console

## Step 3 — Tier 1: Direct Codemod (no AI)
Extract file paths from issues: `issue.component` → strip `project:` prefix.
Run:
```
node codemods/runner.js --rule RULE_ID --files FILE1,FILE2,... [--dry]
```
If `--dry` not set: after success, commit:
```
git add -p  (only changed files)
git commit -m "fix(sonar): [RULE_ID] N files — <desc>"
```
Update `sq-progress.json`.

## Step 4 — Tier 2: Classify then Codemod
1. Take first 5 issues of the rule as sample
2. Call classifier skill with: `{ rule, sample: [[key,file,line,snippet], ...] }`
3. If `safe: true` → run same as Tier 1 (Step 3)
4. If `safe: false` → send all to review-presenter (Step 5)
Token cost: ~300-500 tokens per rule type regardless of issue count.

## Step 5 — Tier 3: Review Presenter
Call review-presenter skill. Developer decides per issue.

## Step 6 — After Each Rule Batch
Run `npm run lint 2>&1 | tail -5` to check for regressions.
On lint error: `git checkout -- .` (rollback) and report.

## Constraints
- Max 50 files per run (add `--limit` to runner call)
- Skip files matching: `node_modules`, `dist`, `/static/`, `.min.js`
- Never auto-commit Tier 3 fixes
- Print final table: Rule | Tier | Fixed | Skipped | Errors
