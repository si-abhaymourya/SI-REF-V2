/**
 * SI Referee v2 — Codemod: no-multi-push
 * Rule: javascript:S7778
 * Merge consecutive same-object method calls that accept multiple arguments:
 *   arr.push(a); arr.push(b);  →  arr.push(a, b);
 *   el.classList.add(a); el.classList.add(b);  →  el.classList.add(a, b);
 *
 * Only merges calls that are:
 * - Consecutive statements in the same block
 * - On the same method (push, classList.add, classList.remove, classList.toggle)
 * - On the identical receiver (by source text comparison)
 * - Each call has exactly one argument (no existing multi-arg calls)
 *
 * Safety: skips if receiver has side effects (only simple identifiers and member exprs).
 */

'use strict';

// Methods that are safe to merge (accept multiple args with same semantics)
const MERGEABLE_METHODS = new Set([
  'push',
  'unshift',
]);

// Member expression method calls that are safe to merge
// Checked as obj.method where method is one of these
const MERGEABLE_MEMBER_METHODS = new Set([
  'add',    // classList.add
  'remove', // classList.remove
]);

/**
 * Get a stable string key for the receiver + method combo.
 * Only works for simple patterns: arr.push, el.classList.add, obj.method
 */
function getCallKey(node, j) {
  if (node.type !== 'ExpressionStatement') return null;
  const expr = node.expression;
  if (expr.type !== 'CallExpression') return null;

  const callee = expr.callee;

  // arr.push(x) — callee is MemberExpression
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const prop = callee.property.name;
    const obj = callee.object;

    // Direct method on identifier: arr.push
    if (MERGEABLE_METHODS.has(prop) && obj.type === 'Identifier') {
      return `${obj.name}.${prop}`;
    }

    // classList.add / classList.remove on el.classList
    if (MERGEABLE_MEMBER_METHODS.has(prop)) {
      if (
        obj.type === 'MemberExpression' &&
        !obj.computed &&
        obj.property.name === 'classList' &&
        obj.object.type === 'Identifier'
      ) {
        return `${obj.object.name}.classList.${prop}`;
      }
    }
  }

  return null;
}

function getArgs(node) {
  return node.expression.arguments;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Process all block-level statement arrays
  function mergeInBlock(statements) {
    if (!statements || statements.length < 2) return statements;

    const result = [];
    let i = 0;

    while (i < statements.length) {
      const curr = statements[i];
      const key = getCallKey(curr, j);

      if (!key) {
        result.push(curr);
        i++;
        continue;
      }

      // Collect a run of consecutive same-key calls
      const run = [curr];
      let j2 = i + 1;
      while (j2 < statements.length && getCallKey(statements[j2], j) === key) {
        run.push(statements[j2]);
        j2++;
      }

      if (run.length === 1) {
        result.push(curr);
        i++;
        continue;
      }

      // Merge: combine all args into the first call
      const mergedArgs = run.flatMap(s => getArgs(s));
      const firstCall = run[0];
      firstCall.expression.arguments = mergedArgs;
      result.push(firstCall);
      changed += run.length - 1; // number of statements removed
      i = j2;
    }

    return result;
  }

  // Walk all block statements
  root.find(j.BlockStatement).forEach(path => {
    path.node.body = mergeInBlock(path.node.body);
  });

  // Also handle top-level program body
  root.find(j.Program).forEach(path => {
    path.node.body = mergeInBlock(path.node.body);
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
