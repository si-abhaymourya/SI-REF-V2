/**
 * SI Referee v2 — Codemod: math-methods
 * Rules: S7767, S7766
 *
 * S7767: ~~x → Math.trunc(x)
 * S7766: a > b ? a : b → Math.max(a, b)
 *         a < b ? a : b → Math.min(a, b)
 *         a >= b ? a : b → Math.max(a, b)
 *         a <= b ? a : b → Math.min(a, b)
 */

'use strict';

function nodesEqual(a, b, j) {
  return j(a).toSource() === j(b).toSource();
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // S7767: ~~x → Math.trunc(x)
  root.find(j.UnaryExpression, { operator: '~' }).forEach(path => {
    if (path.node.argument.type !== 'UnaryExpression') return;
    if (path.node.argument.operator !== '~') return;
    const inner = path.node.argument.argument;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier('Math'), j.identifier('trunc')),
        [inner]
      )
    );
    changed++;
  });

  // S7766: ternary → Math.max / Math.min
  root.find(j.ConditionalExpression).forEach(path => {
    const { test, consequent, alternate } = path.node;
    if (test.type !== 'BinaryExpression') return;
    const { operator, left: tl, right: tr } = test;
    if (!['>', '<', '>=', '<='].includes(operator)) return;

    // a > b ? a : b → Math.max(a, b)
    // a < b ? a : b → Math.min(a, b)
    let fn = null;
    if ((operator === '>' || operator === '>=') &&
        nodesEqual(tl, consequent, j) && nodesEqual(tr, alternate, j)) {
      fn = 'max';
    } else if ((operator === '<' || operator === '<=') &&
               nodesEqual(tl, consequent, j) && nodesEqual(tr, alternate, j)) {
      fn = 'min';
    } else if ((operator === '>' || operator === '>=') &&
               nodesEqual(tr, consequent, j) && nodesEqual(tl, alternate, j)) {
      fn = 'min';
    } else if ((operator === '<' || operator === '<=') &&
               nodesEqual(tr, consequent, j) && nodesEqual(tl, alternate, j)) {
      fn = 'max';
    }

    if (!fn) return;

    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier('Math'), j.identifier(fn)),
        [tl, tr]
      )
    );
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
