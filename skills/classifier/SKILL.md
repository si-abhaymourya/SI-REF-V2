# Classifier — Batch Safety Check

## Purpose
One AI call per rule type. Never per issue.

## Input
```json
{
  "rule": "javascript:S1854",
  "sample": [
    ["KEY", "path/to/file.js", 42, "code snippet line"],
    ["KEY2", "path/to/other.js", 18, "code snippet line"]
  ]
}
```
`sample` = first 5 issues only. Result applies to ALL issues of this rule.

## Output (JSON only, no prose)
```json
{ "safe": true, "reason": "one-line explanation" }
```

## Mark safe=false if ANY sample shows:
- Express middleware signature `(req, res, next)`
- Error-first callback `(err, data)`
- Dynamic property access `obj[variable]`
- `arguments` object usage
- `eval`, `Function(`, `setTimeout(string`
- Side-effectful RHS (function call that could throw or mutate globals)
- The variable name suggests public API (`exports.`, `module.exports`)

## Mark safe=true if:
- Simple literal assignment never read again
- Local variable in a closed function, no side effects in RHS
- Pattern is mechanically invertible

Output JSON only.
