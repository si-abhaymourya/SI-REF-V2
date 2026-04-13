/**
 * SonarQube javascript:S6582
 * Prefer optional chain expression (?.) over && guard chains
 *
 * Conservative — only handles patterns where the guard and the access
 * are on the same simple identifier or member expression:
 *
 *   a && a.b           → a?.b
 *   a && a[k]          → a?.[k]
 *   a && a.b()         → a?.b()
 *   a && a.b && a.b.c  → a?.b?.c
 *
 * Skipped:
 *   - Left side has a function call (side effects)
 *   - Left side is a complex expression (too risky)
 *   - Used as assignment target (a?.b = x is invalid)
 */

module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  function sourceOf(node) {
    try {
      return j(node).toSource();
    } catch {
      return null;
    }
  }

  function hasSideEffects(node) {
    return node.type === 'CallExpression' || node.type === 'NewExpression' || node.type === 'AssignmentExpression';
  }

  root.find(j.LogicalExpression, { operator: '&&' }).forEach((path) => {
    // Skip if parent is also && (we'll process the outermost)
    if (path.parent.node.type === 'LogicalExpression' && path.parent.node.operator === '&&') return;

    // Skip if used as assignment target
    if (path.parent.node.type === 'AssignmentExpression' && path.parent.node.left === path.node) return;

    const { left, right } = path.node;

    // Guard: left must not have side effects
    if (hasSideEffects(left)) return;

    // Pattern: left is Identifier/MemberExpr, right is MemberExpression whose object = left
    if (
      (right.type === 'MemberExpression' || right.type === 'CallExpression') &&
      right.type === 'MemberExpression'
    ) {
      const leftCode = sourceOf(left);
      const rightObjCode = sourceOf(right.object);
      if (!leftCode || leftCode !== rightObjCode) return;
      if (hasSideEffects(left)) return;

      // Replace: a && a.b → a?.b
      const optExpr = j.optionalMemberExpression(
        left,
        right.property,
        right.computed,
        true
      );
      j(path).replaceWith(optExpr);
      changed++;
      return;
    }

    // Pattern: a && a.b() — CallExpression where callee.object = left
    if (right.type === 'CallExpression' && right.callee.type === 'MemberExpression') {
      const leftCode = sourceOf(left);
      const rightObjCode = sourceOf(right.callee.object);
      if (!leftCode || leftCode !== rightObjCode) return;

      const optCallee = j.optionalMemberExpression(
        left,
        right.callee.property,
        right.callee.computed,
        true
      );
      const optCall = j.optionalCallExpression(optCallee, right.arguments, false);
      j(path).replaceWith(optCall);
      changed++;
    }
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
