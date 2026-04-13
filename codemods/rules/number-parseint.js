/**
 * SonarQube javascript:S7773
 * Prefer Number.parseInt / Number.parseFloat / Number.isNaN over global equivalents
 *
 * parseInt(x)        → Number.parseInt(x)
 * parseInt(x, 10)    → Number.parseInt(x, 10)
 * parseFloat(x)      → Number.parseFloat(x)
 * isNaN(x)           → Number.isNaN(x)
 *
 * Skipped:
 *   - Already qualified calls: Number.parseInt, window.parseInt etc.
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  const TARGETS = new Set(['parseInt', 'parseFloat', 'isNaN']);

  root
    .find(j.CallExpression, {
      callee: { type: 'Identifier' },
    })
    .forEach((path) => {
      const { name } = path.node.callee;
      if (!TARGETS.has(name)) return;

      // Replace bare identifier with Number.parseInt / Number.parseFloat
      path.node.callee = j.memberExpression(
        j.identifier('Number'),
        j.identifier(name)
      );
      changed++;
    });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
