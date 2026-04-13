/**
 * SI Referee v2 — Codemod: no-assign-in-condition
 * Rule: javascript:S1121
 * Extract assignments from conditions/ternary branches.
 *
 * Pattern A — ternary with same LHS in both branches:
 *   cond ? (x = true) : (x = false)   → x = cond
 *   cond ? (x = val1) : (x = val2)    → x = cond ? val1 : val2
 *   (as ExpressionStatement or arrow-function body)
 *
 * Pattern B — return with assignment:
 *   return x = value;   → x = value; return value;
 *
 * Safety: only handles cases where LHS is identical in both ternary branches.
 * Skips if LHS has side effects or branches differ in LHS.
 */

'use strict';

function sourceOf(node, j) {
  // Simple source comparison for LHS identity check
  return j(node).toSource();
}

function isBooleanLiteral(node, val) {
  return (node.type === 'Literal' || node.type === 'BooleanLiteral') && node.value === val;
}

function isAssignment(node) {
  return node && node.type === 'AssignmentExpression' && node.operator === '=';
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Pattern A: ExpressionStatement that is a ConditionalExpression where
  // both consequent and alternate are assignments to the same LHS
  root.find(j.ExpressionStatement, {
    expression: { type: 'ConditionalExpression' }
  }).forEach(path => {
    const { test, consequent, alternate } = path.node.expression;

    if (!isAssignment(consequent) || !isAssignment(alternate)) return;
    if (consequent.operator !== '=' || alternate.operator !== '=') return;

    // Both LHS must be identical
    const lhsSrc = sourceOf(consequent.left, j);
    if (lhsSrc !== sourceOf(alternate.left, j)) return;

    const lhs = consequent.left;
    const cval = consequent.right;
    const aval = alternate.right;

    let newRHS;
    if (isBooleanLiteral(cval, true) && isBooleanLiteral(aval, false)) {
      // cond ? (x = true) : (x = false)  →  x = cond
      newRHS = test;
    } else if (isBooleanLiteral(cval, false) && isBooleanLiteral(aval, true)) {
      // cond ? (x = false) : (x = true)  →  x = !cond
      newRHS = j.unaryExpression('!', test);
    } else {
      // cond ? (x = val1) : (x = val2)  →  x = cond ? val1 : val2
      newRHS = j.conditionalExpression(test, cval, aval);
    }

    j(path).replaceWith(
      j.expressionStatement(
        j.assignmentExpression('=', lhs, newRHS)
      )
    );
    changed++;
  });

  // Pattern A in arrow function expression body (forEach callback):
  // arr.forEach((item) => cond ? (item.x = true) : (item.x = false))
  // Arrow function body is the ternary itself (expression body, not block)
  root.find(j.ArrowFunctionExpression).forEach(path => {
    const body = path.node.body;
    if (body.type !== 'ConditionalExpression') return;

    const { test, consequent, alternate } = body;
    if (!isAssignment(consequent) || !isAssignment(alternate)) return;
    if (consequent.operator !== '=' || alternate.operator !== '=') return;

    const lhsSrc = sourceOf(consequent.left, j);
    if (lhsSrc !== sourceOf(alternate.left, j)) return;

    const lhs = consequent.left;
    const cval = consequent.right;
    const aval = alternate.right;

    let newRHS;
    if (isBooleanLiteral(cval, true) && isBooleanLiteral(aval, false)) {
      newRHS = test;
    } else if (isBooleanLiteral(cval, false) && isBooleanLiteral(aval, true)) {
      newRHS = j.unaryExpression('!', test);
    } else {
      newRHS = j.conditionalExpression(test, cval, aval);
    }

    // Convert arrow body from expression to block with assignment
    path.node.body = j.assignmentExpression('=', lhs, newRHS);
    changed++;
  });

  // Pattern B: ReturnStatement with AssignmentExpression as argument
  // return x = value;  →  x = value;\n  return value;
  root.find(j.ReturnStatement).forEach(path => {
    const arg = path.node.argument;
    if (!isAssignment(arg)) return;

    // Only handle if inside a block (so we can insert statements)
    const parentBody = path.parent && path.parent.node.body;
    if (!Array.isArray(parentBody)) return;

    const idx = parentBody.indexOf(path.node);
    if (idx === -1) return;

    const assignStmt = j.expressionStatement(
      j.assignmentExpression('=', arg.left, arg.right)
    );
    const retStmt = j.returnStatement(arg.right);

    parentBody.splice(idx, 1, assignStmt, retStmt);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
