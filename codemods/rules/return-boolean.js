/**
 * SonarQube javascript:S1126
 * Replace if-then-else that returns boolean literals with a direct return
 *
 * Pattern A (if/else):
 *   if (cond) { return true; } else { return false; }  →  return cond;
 *   if (cond) { return false; } else { return true; }  →  return !cond;
 *
 * Pattern B (if + fallthrough):
 *   if (cond) { return true; } return false;  →  return cond;
 *   if (cond) { return false; } return true;  →  return !cond;
 *
 * Skipped:
 *   - if block has more than one statement
 *   - condition contains an assignment
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  function isBoolLiteral(node, val) {
    return node && node.type === 'Literal' && node.value === val;
  }

  function singleReturn(node) {
    if (!node) return null;
    if (node.type === 'ReturnStatement') return node.argument;
    if (node.type === 'BlockStatement' && node.body.length === 1 && node.body[0].type === 'ReturnStatement') {
      return node.body[0].argument;
    }
    return null;
  }

  function hasAssignment(node) {
    let found = false;
    j(node).find(j.AssignmentExpression).forEach(() => { found = true; });
    return found;
  }

  function negate(cond) {
    // Avoid double-negation: !!x → x
    if (cond.type === 'UnaryExpression' && cond.operator === '!') return cond.argument;
    return j.unaryExpression('!', cond, true);
  }

  // Pattern A: if (cond) { return X; } else { return Y; }
  root.find(j.IfStatement).forEach((path) => {
    const { test, consequent, alternate } = path.node;
    if (!alternate) return;
    if (hasAssignment(test)) return;

    const consRet = singleReturn(consequent);
    const altRet = singleReturn(alternate);
    if (consRet === null || altRet === null) return;

    let returnExpr = null;
    if (isBoolLiteral(consRet, true) && isBoolLiteral(altRet, false)) {
      returnExpr = test;
    } else if (isBoolLiteral(consRet, false) && isBoolLiteral(altRet, true)) {
      returnExpr = negate(test);
    }
    if (!returnExpr) return;

    j(path).replaceWith(j.returnStatement(returnExpr));
    changed++;
  });

  // Pattern B: if (cond) { return X; } \n return Y;  (no else, next sibling is return)
  root.find(j.BlockStatement).forEach((blockPath) => {
    const body = blockPath.node.body;
    for (let i = 0; i < body.length - 1; i++) {
      const stmt = body[i];
      const next = body[i + 1];

      if (stmt.type !== 'IfStatement' || stmt.alternate) continue;
      if (next.type !== 'ReturnStatement') continue;
      if (hasAssignment(stmt.test)) continue;

      const consRet = singleReturn(stmt.consequent);
      const nextRet = next.argument;
      if (consRet === null || nextRet === null) continue;

      let returnExpr = null;
      if (isBoolLiteral(consRet, true) && isBoolLiteral(nextRet, false)) {
        returnExpr = stmt.test;
      } else if (isBoolLiteral(consRet, false) && isBoolLiteral(nextRet, true)) {
        returnExpr = negate(stmt.test);
      }
      if (!returnExpr) continue;

      body.splice(i, 2, j.returnStatement(returnExpr));
      i--;
      changed++;
    }
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
