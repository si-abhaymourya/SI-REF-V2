/**
 * SonarQube javascript:S1854
 * Removes dead store assignments: variables assigned but immediately overwritten
 * before any read, or assigned and never read again.
 * Conservative: only removes when the next thing in the same block is another assignment.
 * Tier 2: run only after classifier confirms safe.
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.BlockStatement).forEach((blockPath) => {
    const body = blockPath.node.body;

    for (let i = 0; i < body.length - 1; i++) {
      const cur = body[i];
      const next = body[i + 1];

      // Current statement: x = something (ExpressionStatement with AssignmentExpression)
      if (
        cur.type !== 'ExpressionStatement' ||
        cur.expression.type !== 'AssignmentExpression' ||
        cur.expression.operator !== '='
      ) continue;

      const assigned = cur.expression.left;
      if (assigned.type !== 'Identifier') continue;
      const name = assigned.name;

      // Next statement: same variable assigned again immediately
      if (
        next.type === 'ExpressionStatement' &&
        next.expression.type === 'AssignmentExpression' &&
        next.expression.operator === '=' &&
        next.expression.left.type === 'Identifier' &&
        next.expression.left.name === name
      ) {
        // Check the RHS of current statement doesn't use the variable itself
        const rhsCode = j(cur.expression.right).toSource();
        if (rhsCode.includes(name)) continue; // e.g. x = x + 1 pattern

        // Safe to remove the first (dead) assignment
        body.splice(i, 1);
        i--; // re-check this position
        changed++;
      }
    }
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
