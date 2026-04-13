/**
 * SI Referee v2 — Codemod: else-if
 * Rule: javascript:S6660
 * Collapse redundant else-block that contains only an if statement:
 *   } else {
 *     if (condition) { ... }
 *   }
 * →
 *   } else if (condition) { ... }
 *
 * Only collapses when the else block contains EXACTLY one statement
 * and that statement is an IfStatement.
 *
 * Safety: purely structural — no semantic change.
 */

'use strict';

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.IfStatement).forEach(path => {
    const node = path.node;

    // Must have an else clause that is a block
    if (!node.alternate) return;
    if (node.alternate.type !== 'BlockStatement') return;

    const elseBody = node.alternate.body;

    // Else block must contain exactly one statement
    if (elseBody.length !== 1) return;

    const onlyStmt = elseBody[0];

    // That one statement must be an IfStatement
    if (onlyStmt.type !== 'IfStatement') return;

    // Collapse: replace BlockStatement with the IfStatement directly
    node.alternate = onlyStmt;
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
