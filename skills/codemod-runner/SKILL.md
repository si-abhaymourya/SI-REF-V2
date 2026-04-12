# Codemod Runner

## Steps
1. Look up rule in registry: `node -e "const r=require('./codemods/registry.json'); console.log(JSON.stringify(r['RULE_ID']))"`
2. Build file list from SonarQube issue `component` fields (strip `projectKey:` prefix)
3. Dry run first: `node codemods/runner.js --rule RULE_ID --files FILES --dry`
4. Show output. If N > 0 changed, confirm with user.
5. Apply: `node codemods/runner.js --rule RULE_ID --files FILES`
6. Return `{ changed: N, errors: E }`

## Rules
- Always dry-run before applying
- Run per rule type, not per file
- Skip if codemod field is null (Tier 3 only)
