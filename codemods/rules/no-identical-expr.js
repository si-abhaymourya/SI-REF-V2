/**
 * SonarQube javascript:S1764
 * Flags binary expressions where both sides are identical
 * e.g. a === a → true, b !== b → false (NaN check — keep), x && x → x
 * Conservative: only replaces obvious cases, skips NaN patterns
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  function exprCode(node) {
    // Simple serialization for comparison
    try {
      return j(node).toSource();
    } catch (e) {
      return null;
    }
  }

  root.find(j.BinaryExpression).forEach((path) => {
    const { operator, left, right } = path.node;
    const SAFE_OPS = ['===', '!==', '&&', '||', '-', '/'];
    if (!SAFE_OPS.includes(operator)) return;

    // Skip x !== x — this is the NaN check idiom, keep it
    if (operator === '!==') return;

    const lCode = exprCode(left);
    const rCode = exprCode(right);
    if (!lCode || lCode !== rCode) return;

    // a === a → true
    if (operator === '===') {
      j(path).replaceWith(j.literal(true));
      changed++;
    }
    // x && x → x  (only for simple identifiers, safe)
    else if (operator === '&&' && left.type === 'Identifier') {
      j(path).replaceWith(left);
      changed++;
    }
    // x || x → x  (only for simple identifiers, safe)
    else if (operator === '||' && left.type === 'Identifier') {
      j(path).replaceWith(left);
      changed++;
    }
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
