# Review Presenter — Tier 3 / Risky Tier 2

## Display Format (per issue)
```
──────────────────────────────────────────
Rule : javascript:S1192  |  Tier 3
File : components/si-menu/MenuListing.vue:42
Code : const msg = "Welcome to FIH"; // duplicate literal
──────────────────────────────────────────
[f] fix  [s] skip  [B] skip whole rule  [q] quit review
```

## Keyboard Shortcuts
- `f` — apply suggested fix for this issue (AI-generate minimal edit)
- `s` — skip this issue, add to sq-progress.json skipped[]
- `B` — skip all remaining issues for this rule
- `q` — quit, save progress, print summary

## After `f`
Generate the minimal fix inline. Show unified diff. Ask: `Apply? [y/n]`
On y: edit the file, add to sq-progress.json fixed[].

## Summary on Exit
```
Review complete: X fixed | Y skipped | Z remaining
```
