/**
 * SI Referee v2 — Codemod: no-negated-condition
 * Rule: javascript:S7735
 * Eliminate negated conditions by inverting branches.
 *
 * Pattern A — if/else with negated test:
 *   if (!cond) { A } else { B }  →  if (cond) { B } else { A }
 *
 * Pattern B — ternary with negated test:
 *   !cond ? A : B  →  cond ? B : A
 *
 * Safety constraints:
 * - Pattern A: ONLY when an else branch exists (otherwise no meaningful inversion)
 * - Test must be a simple UnaryExpression with operator '!'
 * - The inner expression must not itself be a '!' (double negation — handled by S6509)
 * - Skip: null-check idioms (x == null, x != null, x === null, x !== null)
 */

'use strict';

/**
 * Given a negated expression `!x`, return the un-negated form.
 * Handles: !x → x, !(a && b) → (a && b), etc.
 */
function stripNegation(node) {
  // !(!x) → x  (already handled by no-double-negation, but be safe)
  return node.argument;
}

/**
 * Check if node is a simple `!expr` — the kind SonarQube S7735 targets.
 * Excludes: `!!x`, `!=`, `!==` (those are not UnaryExpression with !)
 */
function isSimpleNegation(node) {
  return (
    node.type === 'UnaryExpression' &&
    node.operator === '!' &&
    node.argument.type !== 'UnaryExpression' // exclude !!x
  );
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Pattern A: if (!cond) { A } else { B } → if (cond) { B } else { A }
  root.find(j.IfStatement).forEach(path => {
    const { test, consequent, alternate } = path.node;

    // Must have an else branch
    if (!alternate) return;

    // Test must be simple negation
    if (!isSimpleNegation(test)) return;

    // Swap: invert test and swap branches
    path.node.test = stripNegation(test);
    path.node.consequent = alternate;
    path.node.alternate = consequent;
    changed++;
  });

  // Pattern B: !cond ? A : B → cond ? B : A
  // Only in value context (not as an ExpressionStatement — those are already handled)
  root.find(j.ConditionalExpression).forEach(path => {
    const { test, consequent, alternate } = path.node;

    if (!isSimpleNegation(test)) return;

    // Swap: invert test and swap branches
    path.node.test = stripNegation(test);
    path.node.consequent = alternate;
    path.node.alternate = consequent;
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
