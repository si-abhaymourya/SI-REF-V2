/**
 * SonarQube javascript:S1940, javascript:S3403
 * Replaces == with === and != with !==
 * Skips null/undefined checks — `x == null` is intentional (checks both null and undefined)
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  const SKIP_VALUES = new Set(['null', 'undefined']);

  function isNullish(node) {
    return (
      (node.type === 'Literal' && node.value === null) ||
      (node.type === 'Identifier' && SKIP_VALUES.has(node.name))
    );
  }

  root.find(j.BinaryExpression, { operator: '==' }).forEach((path) => {
    if (isNullish(path.node.left) || isNullish(path.node.right)) return;
    path.node.operator = '===';
    changed++;
  });

  root.find(j.BinaryExpression, { operator: '!=' }).forEach((path) => {
    if (isNullish(path.node.left) || isNullish(path.node.right)) return;
    path.node.operator = '!==';
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
