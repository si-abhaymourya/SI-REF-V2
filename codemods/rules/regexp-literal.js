/**
 * SI Referee v2 — Codemod: regexp-literal
 * Rule: javascript:S6325
 * Transform: new RegExp('pattern', 'flags') → /pattern/flags
 *
 * Safety conditions (skip if any violated):
 * - First arg must be a string literal (not a variable/template)
 * - Pattern must not contain unescaped `/`
 * - Second arg (flags), if present, must be a string literal
 * - Resulting regex must be syntactically valid
 */

'use strict';

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.NewExpression, {
    callee: { type: 'Identifier', name: 'RegExp' }
  }).forEach(path => {
    const args = path.node.arguments;
    if (args.length < 1 || args.length > 2) return;

    const patternArg = args[0];
    const flagsArg = args[1];

    // Pattern must be a string literal
    if (patternArg.type !== 'StringLiteral' && patternArg.type !== 'Literal') return;
    const pattern = patternArg.value;
    if (typeof pattern !== 'string') return;

    // Flags must be string literal or absent
    let flags = '';
    if (flagsArg) {
      if (flagsArg.type !== 'StringLiteral' && flagsArg.type !== 'Literal') return;
      flags = flagsArg.value;
      if (typeof flags !== 'string') return;
    }

    // Skip if pattern contains unescaped `/` — would need escaping inside literal
    if (/(?<!\\)\//.test(pattern)) return;

    // Validate the resulting regex is syntactically valid
    let regexObj;
    try {
      regexObj = new RegExp(pattern, flags);
    } catch (e) {
      return; // invalid regex — skip
    }

    // Build a proper regex literal AST node (works with both babel and recast)
    const regexLiteral = {
      type: 'Literal',
      value: regexObj,
      regex: { pattern, flags },
      raw: `/${pattern}/${flags}`,
    };

    j(path).replaceWith(regexLiteral);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
