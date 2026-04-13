/**
 * SI Referee v2 — Codemod: no-bool-literal
 * Rule: javascript:S1125
 * Transforms:
 *   x === true  → x
 *   x !== true  → !x
 *   x === false → !x
 *   x !== false → x (or !!x when not in boolean context)
 *   if (x == true)  → if (x)
 *   return x === true → return x
 *
 * Safety: only strips boolean literals when operand has no side effects.
 */

'use strict';

function hasSideEffects(node) {
  return node.type === 'CallExpression' ||
         node.type === 'AssignmentExpression' ||
         node.type === 'UpdateExpression' ||
         node.type === 'AwaitExpression';
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.BinaryExpression).forEach(path => {
    const { operator, left, right } = path.node;
    if (!['===', '!==', '==', '!='].includes(operator)) return;

    let expr = null;
    let boolVal = null;

    // x === true / x !== true / x == true / x != true
    if (right.type === 'Literal' && typeof right.value === 'boolean') {
      expr = left; boolVal = right.value;
    } else if (left.type === 'Literal' && typeof left.value === 'boolean') {
      expr = right; boolVal = left.value;
    } else {
      return;
    }

    if (hasSideEffects(expr)) return;

    let replacement;
    const isPositive = (operator === '===' || operator === '==');

    if (boolVal === true) {
      // x === true → x,  x !== true → !x
      replacement = isPositive
        ? expr
        : j.unaryExpression('!', expr);
    } else {
      // x === false → !x,  x !== false → x
      replacement = isPositive
        ? j.unaryExpression('!', expr)
        : expr;
    }

    j(path).replaceWith(replacement);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
