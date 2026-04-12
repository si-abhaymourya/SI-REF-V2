/**
 * SonarQube javascript:S2757
 * Fixes typo operators: =+ → += and =- → -=
 * e.g. x =+ 1  was meant as x += 1
 *      x =- 1  was meant as x -= 1
 * These appear in AST as AssignmentExpression(=, UnaryExpression(+/-))
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.AssignmentExpression, { operator: '=' }).forEach((path) => {
    const right = path.node.right;
    if (right.type !== 'UnaryExpression') return;
    if (right.prefix !== true) return;

    const op = right.operator;
    if (op !== '+' && op !== '-') return;

    // Only fix when the inner argument is the same identifier as the left
    // e.g. x = +x (not a typo, intentional unary), but x =+ someOtherValue is
    // Actually S2757 fires when rhs starts with unary +/- right after =
    // We replace x =+ y with x += y only if y is NOT x (otherwise it's intentional)
    const left = path.node.left;
    const inner = right.argument;
    if (left.type === 'Identifier' && inner.type === 'Identifier' && left.name === inner.name) return;

    path.node.operator = op === '+' ? '+=' : '-=';
    path.node.right = inner;
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
