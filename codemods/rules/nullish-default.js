/**
 * SI Referee v2 — Codemod: nullish-default
 * Rule: javascript:S6644
 * Transform: x ? x : y → x ?? y
 *
 * Safety rules:
 * - Only applies when test and consequent are IDENTICAL identifiers (a ? a : b)
 * - OR identical member expressions (a.b ? a.b : c)
 * - Skips if test has side effects (calls, assignments)
 * - Does NOT transform a?.b ? a.b : c (optional chain mismatch)
 */

'use strict';

function nodesEqual(a, b, j) {
  if (a.type !== b.type) return false;
  if (a.type === 'Identifier') return a.name === b.name;
  if (a.type === 'MemberExpression') {
    return nodesEqual(a.object, b.object, j) &&
           nodesEqual(a.property, b.property, j) &&
           a.computed === b.computed &&
           !a.optional && !b.optional;
  }
  return false;
}

function hasSideEffects(node) {
  return node.type === 'CallExpression' ||
         node.type === 'AssignmentExpression' ||
         node.type === 'UpdateExpression' ||
         node.type === 'AwaitExpression' ||
         node.type === 'YieldExpression';
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.ConditionalExpression).forEach(path => {
    const { test, consequent, alternate } = path.node;

    // Skip if test has side effects
    if (hasSideEffects(test)) return;

    // test and consequent must be identical (same identifier or member expr)
    if (!nodesEqual(test, consequent, j)) return;

    // Replace: x ? x : y → x ?? y
    j(path).replaceWith(
      j.logicalExpression('??', test, alternate)
    );
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
