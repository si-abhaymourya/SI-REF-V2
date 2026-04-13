/**
 * SonarQube javascript:S7781
 * Prefer String#replaceAll() over String#replace()
 *
 * Three cases:
 *   1. .replace("str", x)        → .replaceAll("str", x)          always safe
 *   2. .replace(/pat/g, x)       → .replaceAll("pat", x)          only if pattern has no special regex chars
 *   3. .replace(/pat/g, x)       → .replaceAll(/pat/g, x)         complex pattern — rename only, keep regex
 *
 * Skipped:
 *   - .replace(/pat/, x)  — no global flag — single-replace, semantics differ
 *   - .replace(/pat/gi, x) — has flags beyond g — rename only (replaceAll supports regex with g+other flags)
 */

// Regex special chars that make pattern unsafe to convert to a plain string
const REGEX_SPECIAL = /[.+*?^${}()[\]|\\]/;

module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { type: 'Identifier', name: 'replace' },
      },
    })
    .forEach((path) => {
      const args = path.node.arguments;
      if (args.length !== 2) return;

      const [firstArg] = args;

      // Case 1: string literal argument — direct rename
      if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
        path.node.callee.property.name = 'replaceAll';
        changed++;
        return;
      }

      // Case 2 & 3: regex literal
      if (firstArg.type === 'Literal' && firstArg.regex) {
        const { pattern, flags } = firstArg.regex;

        // No global flag — semantics differ (single replace), skip
        if (!flags.includes('g')) return;

        path.node.callee.property.name = 'replaceAll';

        const otherFlags = flags.replace('g', '');

        // Only g flag + simple pattern (no special chars) → convert regex to string literal
        if (otherFlags === '' && !REGEX_SPECIAL.test(pattern)) {
          args[0] = j.literal(pattern);
        }
        // else: complex pattern or extra flags — keep regex as-is, method renamed above

        changed++;
      }
    });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
