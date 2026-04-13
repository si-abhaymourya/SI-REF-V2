# SI Referee V2

Automated SonarQube issue fixer. Fetches issues live via MCP, fixes mechanical patterns with AST codemods (zero AI tokens), AI-fixes the rest in batches, verifies with a build after every 15–20 fixes, and rolls back cleanly on failure.

---

## Prerequisites

- Docker
- Cursor or Claude Code (your choice)
- A running SonarQube instance (local or remote)

---

## Step 1 — Set environment variables (once per machine)

**macOS / Linux** — add to `~/.zshrc` or `~/.bashrc`:
```bash
export SONARQUBE_TOKEN=squ_your_token_here
export SONARQUBE_URL=http://localhost:9000
```

**Windows** — System Settings → Environment Variables:
```
SONARQUBE_TOKEN = squ_your_token_here
SONARQUBE_URL   = http://localhost:9000
```

> **How to get your token:** SonarQube UI → My Account → Security → Generate Token → type: **User token**

---

## Step 2 — Copy files to your project

Copy these two things from this repo into your project root:

```bash
# MCP server config
cp mcp.json /path/to/your-project/mcp.json

# Skills folder
cp -r skills/ /path/to/your-project/skills/
```

No edits needed — `mcp.json` reads the env vars from Step 1 automatically.

---

## Step 3 — Connect MCP in your IDE

**Cursor:**
Cursor reads `mcp.json` from the project root automatically. Open your project — MCP is active.

**Claude Code:**
```bash
cd your-project
claude mcp add --config mcp.json
```

Both IDEs use the same `mcp.json` file. No separate config needed.

---

## Step 4 — Run

**Cursor:** open chat → type `/sq-fix-issues`

**Claude Code:** in terminal → type `/sq-fix-issues`

**The tool auto-detects the SonarQube project key** — no manual config needed. It checks in order:

1. `sonarqube-fix.config.json` in repo root (exists after first run)
2. `sonar-project.properties` → reads `sonar.projectKey=...`
3. Calls `sonarqube_search_projects()` via MCP → matches by repo/package name
4. If still ambiguous → shows a short list, asks once

After first run it writes `sonarqube-fix.config.json` so detection never runs again:
```json
{
  "projectKey": "my-project",
  "buildCommand": "npm run build",
  "skipRules": []
}
```

`skipRules` is optional — add rule IDs your team has decided to permanently ignore.

---

## Flags

```
/sq-fix-issues --rule javascript:S1854   → fix one specific rule only
/sq-fix-issues --dry                     → preview changes, no edits applied
```

---

## Dashboard

Open `sq-dashboard.html` in any browser. It reads `sq-dashboard-data.json` and auto-refreshes every 30 seconds.

Shows: issues resolved, tokens saved vs naive, build pass/fail per batch, per-rule status.

---

## How tokens are counted

| Operation | Cost |
|---|---|
| Run existing codemod | 0 tokens |
| Generate new codemod (once per rule, reused forever) | ~600 tokens |
| Fetch rule details from MCP | ~300 tokens |
| AI fix per issue | ~400 tokens |
| **Old approach** (AI per issue, no codemods) | ~500 × total issues |

**Savings = Old estimate − Actual.** Shown live in the dashboard.

---

## What's in this repo

```
skills/                         ← copy to your project (works with Cursor + Claude Code)
  sq-fix-issues/SKILL.md        ← main orchestrator
  classifier/SKILL.md           ← mechanical vs judgment decision
  codemod-runner/SKILL.md       ← generate + run AST transforms
  review-presenter/SKILL.md     ← human review for security/complex issues

codemods/
  registry.json                 ← known rule → transform mapping (JS/TS/Vue, 37 rules)
  runner.js                     ← runs jscodeshift transforms
  rules/                        ← 37 pre-built transforms

mcp.json                        ← MCP config (copy to your project, works for Cursor + Claude Code)
sonarqube-fix.config.json       ← auto-generated on first run (or create manually)
sq-dashboard.html               ← progress dashboard
sq-dashboard-data.json          ← dashboard data schema (written by the tool)
```

---

## Supported stacks

The 37 pre-built codemods cover JS / TS / Vue / React / Next.js out of the box.

For .NET, Kotlin, Python, Go: the tool fetches rule details from SonarQube MCP and generates an appropriate transform on the fly. Generated transforms are saved to `codemods/registry.json` and reused in every future session at zero cost.
