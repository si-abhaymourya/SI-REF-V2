/**
 * SonarQube javascript:S1128
 * Remove unused named imports from import declarations.
 *
 * import { used, unused } from './mod'  →  import { used } from './mod'
 * import { unused } from './mod'        →  (entire import removed)
 *
 * Conservative:
 *   - Only removes named specifiers (not default or namespace imports)
 *   - Keeps import if it has side-effect-only form: import './mod'
 *   - Keeps default import untouched
 *   - Checks all Identifier references in file (read OR write)
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  // Collect all identifier names used outside import declarations
  const usedNames = new Set();
  root.find(j.Identifier).forEach((path) => {
    // Skip all identifiers that are part of an import declaration
    const parent = path.parent.node;
    if (parent.type === 'ImportSpecifier') return;
    if (parent.type === 'ImportDefaultSpecifier') return;
    if (parent.type === 'ImportNamespaceSpecifier') return;
    usedNames.add(path.node.name);
  });

  root.find(j.ImportDeclaration).forEach((path) => {
    const specifiers = path.node.specifiers;
    if (!specifiers || specifiers.length === 0) return; // side-effect import

    const survivors = specifiers.filter((spec) => {
      // Always keep default and namespace imports
      if (spec.type === 'ImportDefaultSpecifier') return true;
      if (spec.type === 'ImportNamespaceSpecifier') return true;
      // Remove named specifier only if its local name is unused
      return usedNames.has(spec.local.name);
    });

    if (survivors.length === specifiers.length) return; // nothing to remove

    if (survivors.length === 0) {
      // All specifiers unused — remove entire import
      j(path).remove();
    } else {
      path.node.specifiers = survivors;
    }
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
