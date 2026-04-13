/**
 * SI Referee v2 — Codemod: no-dead-expr
 * Rule: javascript:S905
 * Fix expression statements that have no side effects.
 *
 * Pattern A — Ternary as statement where one branch is a no-op literal:
 *   cond ? call() : ""   → if (cond) call()
 *   cond ? "" : call()   → if (!cond) call()
 *   cond ? (x=v) : ""   → if (cond) x = v
 *
 * Pattern B — Standalone dead template literal / string literal:
 *   ``   or   ""   →  remove (delete the statement)
 *
 * Pattern C — Comma expression in block: f(), g()
 *   { f(), g() }  →  { f(); g(); }
 *   (arrow function body that is a SequenceExpression)
 *
 * Safety: only handles cases where the "live" branch is clearly an expression
 * with side effects (call expression, assignment) and the "dead" branch is a
 * literal (string, number, boolean, null, undefined, empty template literal).
 */

'use strict';

const DEAD_TYPES = new Set(['Literal', 'NumericLiteral', 'StringLiteral', 'BooleanLiteral', 'NullLiteral']);

function isDeadLiteral(node) {
  if (!node) return false;
  if (DEAD_TYPES.has(node.type)) return true;
  // Empty template literal: `  ` with no expressions
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return true;
  // undefined identifier
  if (node.type === 'Identifier' && node.name === 'undefined') return true;
  return false;
}

function hasSideEffect(node) {
  if (!node) return false;
  return (
    node.type === 'CallExpression' ||
    node.type === 'AssignmentExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'NewExpression' ||
    node.type === 'AwaitExpression'
  );
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Pattern A: ExpressionStatement with ConditionalExpression where one branch is dead
  root.find(j.ExpressionStatement, {
    expression: { type: 'ConditionalExpression' }
  }).forEach(path => {
    const { test, consequent, alternate } = path.node.expression;

    const consIsDead = isDeadLiteral(consequent);
    const altIsDead  = isDeadLiteral(alternate);

    if (consIsDead && !altIsDead && hasSideEffect(alternate)) {
      // cond ? "" : call()  →  if (!cond) call()
      const negatedTest = (test.type === 'UnaryExpression' && test.operator === '!')
        ? test.argument
        : j.unaryExpression('!', test);
      j(path).replaceWith(
        j.ifStatement(negatedTest, j.blockStatement([j.expressionStatement(alternate)]))
      );
      changed++;
    } else if (altIsDead && !consIsDead && hasSideEffect(consequent)) {
      // cond ? call() : ""  →  if (cond) call()
      j(path).replaceWith(
        j.ifStatement(test, j.blockStatement([j.expressionStatement(consequent)]))
      );
      changed++;
    } else if (consIsDead && !altIsDead && alternate.type === 'AssignmentExpression') {
      // cond ? "" : (x = v)  →  if (!cond) x = v
      const negatedTest = (test.type === 'UnaryExpression' && test.operator === '!')
        ? test.argument
        : j.unaryExpression('!', test);
      j(path).replaceWith(
        j.ifStatement(negatedTest, j.blockStatement([j.expressionStatement(alternate)]))
      );
      changed++;
    } else if (altIsDead && !consIsDead && consequent.type === 'AssignmentExpression') {
      // cond ? (x = v) : ""  →  if (cond) x = v
      j(path).replaceWith(
        j.ifStatement(test, j.blockStatement([j.expressionStatement(consequent)]))
      );
      changed++;
    }
  });

  // Pattern B: Standalone dead template literal / string literal as statement
  root.find(j.ExpressionStatement).forEach(path => {
    const expr = path.node.expression;
    if (!isDeadLiteral(expr)) return;

    // Only remove if it's truly a standalone statement (not the only thing in a function body)
    const parentBody = path.parent && path.parent.node.body;
    if (!Array.isArray(parentBody)) return;
    if (parentBody.length === 1) return; // sole statement — leave it (might be intentional marker)

    j(path).remove();
    changed++;
  });

  // Pattern C: Arrow function with SequenceExpression body (comma operator)
  // (item) => f(), g()   →   (item) => { f(); g(); }
  root.find(j.ArrowFunctionExpression).forEach(path => {
    const body = path.node.body;
    if (body.type !== 'SequenceExpression') return;
    // Convert sequence to block
    const stmts = body.expressions.map(e => j.expressionStatement(e));
    path.node.body = j.blockStatement(stmts);
    changed++;
  });

  // Pattern C in block bodies: ExpressionStatement that is a SequenceExpression
  root.find(j.ExpressionStatement, {
    expression: { type: 'SequenceExpression' }
  }).forEach(path => {
    const exprs = path.node.expression.expressions;
    const stmts = exprs.map(e => j.expressionStatement(e));
    const parentBody = path.parent && path.parent.node.body;
    if (!Array.isArray(parentBody)) return;
    const idx = parentBody.indexOf(path.node);
    if (idx === -1) return;
    parentBody.splice(idx, 1, ...stmts);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
