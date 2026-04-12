/**
 * SonarQube javascript:S6777
 * Replaces `window.X` with `globalThis.X`
 *
 * Skips:
 *   - `typeof window`   — SSR guard pattern, changing breaks server-side checks
 *   - `window = X`      — assignment to window itself (very rare, keep as-is)
 *
 * Safe because:
 *   - globalThis === window in browsers (no behaviour change)
 *   - globalThis.X returns undefined on Node.js instead of throwing ReferenceError
 *     (better than window.X which throws in SSR context)
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.Identifier, { name: 'window' }).forEach((path) => {
    const parent = path.parent.node;

    // Skip `typeof window` — SSR guard, must stay as-is
    if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') return;

    // Skip `window = something` — assigning to window itself
    if (parent.type === 'AssignmentExpression' && parent.left === path.node) return;

    // Skip if window is a locally declared variable (parameter or declared in scope)
    // by checking if any ancestor scope declares `window`
    let ancestor = path.parent;
    while (ancestor) {
      const node = ancestor.node;
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        const params = node.params || [];
        if (params.some((p) => p.type === 'Identifier' && p.name === 'window')) return;
      }
      ancestor = ancestor.parent;
    }

    // Replace identifier name
    path.node.name = 'globalThis';
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
