/**
 * SI Referee v2 — Codemod: dom-methods
 * Rules: S7762
 *
 * S7762: parentNode.removeChild(child) → child.remove()
 *        Only when it's a standalone expression statement.
 */

'use strict';

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'removeChild' } }
  }).forEach(path => {
    if (path.node.arguments.length !== 1) return;
    // Only replace when standalone expression statement
    if (path.parent.node.type !== 'ExpressionStatement') return;

    const child = path.node.arguments[0];
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(child, j.identifier('remove')),
        []
      )
    );
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
