# SI Referee V2

Fixes SonarQube issues automatically — AST codemods for mechanical patterns (zero AI tokens), AI for the rest, build verify every 15–20 fixes, rollback on failure.

---

## Setup (2 steps, done once per project)

### Step 1 — Fill in your token

Copy `mcp.example.json` → `mcp.json` and fill in your values:

```json
"SONARQUBE_TOKEN": "squ_your_token_here",
"SONARQUBE_URL":   "http://localhost:9000"
```

> Get your token: SonarQube → My Account → Security → Generate Token → **User token** type

`mcp.json` is gitignored — your token never gets committed.

### Step 2 — Copy to your project

```bash
cp mcp.json        /path/to/your-project/
cp -r skills/      /path/to/your-project/skills/
cp -r codemods/    /path/to/your-project/codemods/
cp sq-dashboard.html        /path/to/your-project/
cp sq-dashboard-data.json   /path/to/your-project/
```

---

## Run

**Cursor:** open project → chat → `/sq-fix-issues`

**Claude Code:** open project → `/sq-fix-issues`

The tool detects your SonarQube project automatically (reads `sonar-project.properties` or lists projects via MCP). On first run it creates `sonarqube-fix.config.json` — never asks again.

---

## Flags

```
/sq-fix-issues --rule javascript:S1854   → one rule only
/sq-fix-issues --dry                     → preview, no changes
```

---

## Dashboard

Open `sq-dashboard.html` in a browser. Auto-refreshes every 30s.
Shows: issues fixed, tokens saved, build history, per-rule status.

---

## What's in this repo

```
mcp.example.json          ← template — copy to mcp.json and fill in token
skills/                   ← AI instruction files (works with Cursor + Claude Code)
codemods/
  registry.json           ← 37 pre-built JS/TS/Vue rule → transform mappings
  runner.js               ← runs jscodeshift
  rules/                  ← transform files
sq-dashboard.html         ← dashboard
sq-dashboard-data.json    ← dashboard data (written by the tool)
```

---

## Token savings

| What happened | Tokens spent |
|---|---|
| Codemod ran (existing) | 0 |
| Codemod generated (new rule, saved forever) | ~600 |
| Rule detail fetched from MCP | ~300 |
| AI fixed one issue | ~400 |
| Old approach (AI per issue, no codemods) | ~500 × every issue |

Savings shown live in the dashboard.

---

## Supported stacks

JS / TS / Vue / React / Next.js — 37 codemods pre-built, runs immediately.

.NET / Kotlin / Python / Go — tool generates transforms on the fly via SonarQube MCP. Saved to `codemods/registry.json`, reused forever after.
