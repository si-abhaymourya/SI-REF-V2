/**
 * SI Referee v2 — Codemod: no-double-negation
 * Rule: javascript:S6509
 * Transform: !!x → Boolean(x)  (or just x when in boolean context)
 *
 * Strategy:
 * - !!x in boolean context (if test, logical operand, ternary test) → x
 * - !!x elsewhere → Boolean(x)
 */

'use strict';

function isDoubleNegation(node) {
  return node.type === 'UnaryExpression' &&
         node.operator === '!' &&
         node.argument.type === 'UnaryExpression' &&
         node.argument.operator === '!';
}

function isInBooleanContext(path) {
  const parent = path.parent.node;
  const pt = parent.type;
  if (pt === 'IfStatement' && parent.test === path.node) return true;
  if (pt === 'WhileStatement' && parent.test === path.node) return true;
  if (pt === 'ConditionalExpression' && parent.test === path.node) return true;
  if (pt === 'LogicalExpression') return true;
  if (pt === 'ReturnStatement') return false; // returned value — use Boolean()
  return false;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.UnaryExpression, { operator: '!' }).forEach(path => {
    if (!isDoubleNegation(path.node)) return;

    const inner = path.node.argument.argument; // the value inside !!

    let replacement;
    if (isInBooleanContext(path)) {
      // boolean context → just unwrap
      replacement = inner;
    } else {
      // general context → Boolean(x)
      replacement = j.callExpression(j.identifier('Boolean'), [inner]);
    }

    j(path).replaceWith(replacement);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
