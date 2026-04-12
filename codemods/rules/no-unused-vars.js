/**
 * SonarQube javascript:S1481
 * Removes unused local variable declarations.
 * Conservative: skips exports, function params, Vue component options, destructuring.
 * Tier 2: run only after classifier confirms safe.
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  // Collect all identifiers referenced ANYWHERE outside their own declaration.
  // This includes assignment targets — removing a declaration but leaving `x = value`
  // would orphan the assignment (ReferenceError in strict mode).
  const referencedNames = new Set();

  root.find(j.Identifier).forEach((path) => {
    const parent = path.parent.node;
    // Skip only the declaration name itself (e.g. `let x` → skip `x` here)
    if (parent.type === 'VariableDeclarator' && parent.id === path.node) return;
    // Skip property keys in object expressions (shorthand {foo} still adds foo via value)
    if (parent.type === 'Property' && parent.key === path.node && !parent.computed) return;
    referencedNames.add(path.node.name);
  });

  root.find(j.VariableDeclaration).forEach((declPath) => {
    // Only handle function-scoped declarations (not top-level module exports)
    if (declPath.parent.node.type === 'Program') return;

    const survivors = declPath.node.declarations.filter((decl) => {
      if (!decl.id || decl.id.type !== 'Identifier') return true; // keep destructuring
      const name = decl.id.name;
      if (referencedNames.has(name)) return true; // referenced anywhere (read or write)
      // Keep if name looks like Vue lifecycle or option (mounted, data, etc.)
      const VUE_NAMES = new Set(['data', 'methods', 'computed', 'watch', 'props', 'components', 'mounted', 'created', 'beforeMount', 'destroyed']);
      if (VUE_NAMES.has(name)) return true;
      return false;
    });

    if (survivors.length === declPath.node.declarations.length) return;

    if (survivors.length === 0) {
      j(declPath).remove();
    } else {
      declPath.node.declarations = survivors;
    }
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
