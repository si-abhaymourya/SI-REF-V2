/**
 * SI Referee v2 — Codemod: no-redundant-jump
 * Rule: javascript:S3626
 * Transform: remove redundant return/continue at the end of a block
 *
 * Redundant cases:
 * - `return;` (void return) as last statement in a function body
 * - `continue;` as last statement in a loop body
 */

'use strict';

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Remove redundant `return;` at end of function body
  const funcTypes = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];
  funcTypes.forEach(type => {
    root.find(j[type]).forEach(path => {
      const body = path.node.body;
      if (!body || body.type !== 'BlockStatement') return;
      const stmts = body.body;
      if (!stmts.length) return;
      const last = stmts[stmts.length - 1];
      // Redundant: return; with no argument
      if (last.type === 'ReturnStatement' && !last.argument) {
        stmts.pop();
        changed++;
      }
    });
  });

  // Remove redundant `continue;` at end of loop body
  const loopTypes = ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'];
  loopTypes.forEach(type => {
    root.find(j[type]).forEach(path => {
      const body = path.node.body;
      if (!body || body.type !== 'BlockStatement') return;
      const stmts = body.body;
      if (!stmts.length) return;
      const last = stmts[stmts.length - 1];
      if (last.type === 'ContinueStatement' && !last.label) {
        stmts.pop();
        changed++;
      }
    });
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
