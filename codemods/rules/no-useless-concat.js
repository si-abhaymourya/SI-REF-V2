/**
 * SonarQube javascript:S6853
 * Converts string concatenation chains to template literals
 * e.g. 'Hello ' + name + '!' → `Hello ${name}!`
 * Conservative: only converts simple chains, skips += and complex expressions
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  function isStringLiteral(node) {
    return node.type === 'Literal' && typeof node.value === 'string';
  }

  function hasStringPart(node) {
    if (node.type !== 'BinaryExpression' || node.operator !== '+') return false;
    return isStringLiteral(node.left) || isStringLiteral(node.right) || hasStringPart(node.left) || hasStringPart(node.right);
  }

  function buildTemplateParts(node, quasis, expressions) {
    if (isStringLiteral(node)) {
      quasis.push(node.value);
      return;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      buildTemplateParts(node.left, quasis, expressions);
      // After left, if right is not a string we need an expression slot
      if (!isStringLiteral(node.right) && !(node.right.type === 'BinaryExpression' && node.right.operator === '+')) {
        expressions.push(node.right);
        quasis.push(''); // placeholder for after-expression string
      } else {
        buildTemplateParts(node.right, quasis, expressions);
      }
      return;
    }
    // Non-string non-concat node: it's an expression
    expressions.push(node);
    quasis.push('');
  }

  root.find(j.BinaryExpression, { operator: '+' }).forEach((path) => {
    // Only process top-level concat chains (skip if parent is also +)
    if (path.parent.node.type === 'BinaryExpression' && path.parent.node.operator === '+') return;
    if (!hasStringPart(path.node)) return;

    // Collect all parts
    const parts = flattenConcat(path.node);
    if (parts.length < 3) return; // need at least string + expr + string

    const hasExprPart = parts.some((p) => p.type !== 'string');
    if (!hasExprPart) return; // pure string concat, not worth templating

    // Build template literal
    const quasiStrings = [];
    const templateExpressions = [];
    let current = '';

    for (const part of parts) {
      if (part.type === 'string') {
        current += part.value;
      } else {
        quasiStrings.push(current);
        current = '';
        templateExpressions.push(part.node);
      }
    }
    quasiStrings.push(current);

    const quasis = quasiStrings.map((str, i) =>
      j.templateElement({ raw: str.replaceAll('`', '\\`'), cooked: str }, i === quasiStrings.length - 1)
    );

    j(path).replaceWith(j.templateLiteral(quasis, templateExpressions));
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};

function flattenConcat(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return [{ type: 'string', value: node.value }];
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...flattenConcat(node.left), ...flattenConcat(node.right)];
  }
  return [{ type: 'expr', node }];
}
