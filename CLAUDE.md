# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts file-watcher, proxy server, API/SSG server, and Express app concurrently)
npm run dev-nuxt

# Individual servers
npm run file-watcher          # Gulp: compile client JS (port varies)
npm run start-proxy-server    # Proxy server on port 5555
npm run start-api-server      # SSG/API server on port 8888
npm run express               # Express app on port 3000

# Build
npm run build                 # Nuxt build
npm run server:build          # Create server bundles
npm run deploy-time           # Full build (Nuxt + server)

# Lint
npm run lint

# Test
npm run test                  # Mocha
npm run test-middleware        # Middleware tests

# Static dev (without Express)
npm run dev-static-nuxt
```

## Architecture

This is a **Nuxt 2 (Vue 2) SSR sports content platform** with an Express.js backend, multi-client support, and CMS-driven dynamic rendering.

### Request Flow

1. **Proxy server** (port 5555) routes incoming requests to Express
2. **Express app** (`app.js`, port 3000) handles requests via server middleware
3. **Server middleware** (`server-middleware/`) fetches full page config from the CMS/API
4. **`sdk/apiDataParser.js`** parses API responses — the central data processing module
5. **`pages/_.vue`** (single catch-all Nuxt page) receives parsed data and renders dynamic body components
6. Components are resolved via `sdk/components-parser/` and the **WidgetLibrary** (`sdk/WidgetLibrary/`)

### Multi-Client System

- The `CLIENT` value in `config.json` determines which client is active (e.g., `fih` for Field Hockey International)
- Client-specific JS lives in `/clients/{client}/js/` and is compiled by Gulp into `/static/`
- Nuxt builds output to `./dist/{CLIENT}/server-build`
- The SSG server (`/SSG/`) handles static site generation at port 8888

### Component Architecture

- All components use the `si-` prefix (e.g., `si-ads`, `si-menu`, `si-player`)
- Components are organized by feature in `/components/` and auto-registered globally
- Each component typically has variant layouts (`Layout01`, `Layout02`, etc.)
- Dynamic rendering: CMS config data → `componentTypeParser` → Vue component resolution

### Key SDK Modules

| Module | Purpose |
|--------|---------|
| `sdk/apiDataParser.js` | Main API fetching and data parsing (central module) |
| `sdk/components-parser/` | Maps API data to component props |
| `sdk/WidgetLibrary/` | Complex data transformation for widgets |
| `sdk/CacheManager/` | Redis-backed caching |
| `sdk/Redis/` | Raw Redis get/set operations |
| `sdk/mappers/` | Asset type and mobile component mappings |

### Caching

Redis is used for both config caching and page data caching. Config is loaded from Redis on startup (`app.js`) and updated via API routes (`/routes/index.js`). Cache invalidation uses Redis pub/sub.

### Routing

- `/routes/index.js` — Config updates, cache management endpoints
- `/routes/feeds.js` — Feed data routes
- `/routes/fdp.js` — FDP-specific routes
- `/routes/dotNet.js` — .NET integration

### Build System

- **Gulp** (`gulpfile.js`) orchestrates client JS compilation using esbuild and Webpack
- **esbuild-vue** compiles Vue single-file components for the client bundles
- Per-client modules are bundled separately for each supported client

## Code Standards

- ESLint with Vue 3 recommended rules (`.eslintrc.json`)
- Prettier with `printWidth: 300` (`.prettierrc.json`)
- Conventional commits enforced via commitlint + Husky
- `no-console` is a warning (not error) — logs go through Winston
- Branch naming is enforced by git hooks

## PR Process

PRs require a Jira ticket reference. Use the template in `.github/pull_request_template.md`.

## SI Referee v2 — SonarQube Automation

Automated issue reduction pipeline. Baseline: 5300 issues → currently ~3800 (Tier 1 complete).

### Usage
```bash
/sq-fix-issues                        # Process all open issues, all tiers
/sq-fix-issues --rule javascript:S3504  # Target one rule
/sq-fix-issues --tier 1               # Only zero-AI codemods
/sq-fix-issues --dry                  # Preview without applying
```

### Three-Tier System

| Tier | Strategy | AI Tokens | Dev Input |
|------|----------|-----------|-----------|
| 1 | Pre-built jscodeshift codemod, runs directly | 0 | 0 |
| 2 | Batch classifier (1 call/rule) → codemod if safe | ~400/rule | 0 if safe |
| 3 | Review presenter — human decides per issue | per fix | required |

### Key Files
| File | Purpose |
|------|---------|
| `codemods/registry.json` | Maps SonarQube rule ID → tier + codemod name |
| `codemods/runner.js` | CLI: runs jscodeshift for a given rule + file list |
| `codemods/rules/*.js` | jscodeshift transforms (one per Sonar rule) |
| `sq-progress.json` | Tracks fixed/skipped counts per rule, resumable |
| `skills/sq-fix-issues/SKILL.md` | Orchestrator skill |
| `skills/classifier/SKILL.md` | Batch safety classifier |
| `skills/codemod-runner/SKILL.md` | Codemod execution skill |
| `skills/review-presenter/SKILL.md` | Interactive review for Tier 3 |

### Adding a New Rule
1. Add entry to `codemods/registry.json` with tier + codemod name
2. If tier 1 or 2: write `codemods/rules/<codemod-name>.js` (jscodeshift transform)
3. Run `/sq-fix-issues --rule <rule-id> --dry` to preview

### Direct Codemod Run (bypass skills)
```bash
# JS files: jscodeshift
node codemods/runner.js --rule javascript:S3504 --files path/to/file.js --dry
node codemods/runner.js --rule javascript:S3504 --all --dry

# Vue files: use isolated ESLint config (never use main .eslintrc — it reformats templates)
VUE_FILES=$(git ls-files -- '*.vue' | grep -vE "node_modules|/dist/" | tr '\n' ' ')
npx eslint --no-eslintrc --env browser --env es2021 --env node \
  --plugin vue --parser vue-eslint-parser \
  --parser-options "ecmaVersion:12,sourceType:module" \
  --rule 'no-var: error' --rule 'eqeqeq: [error, always, {null: ignore}]' \
  --fix $VUE_FILES
```
