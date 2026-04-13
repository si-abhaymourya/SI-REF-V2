/**
 * SI Referee v2 — Codemod: no-self-assign
 * Rule: javascript:S7740
 * Transform: remove `const self = this` / `let self = this` / `var self = this`
 *   that are declarations in a function body.
 *
 * Safety: only removes declarations where the variable is `self` (or `_this`, `that`)
 * and the value is exactly `this`. Does NOT rename usages — leave for devs or a
 * follow-up pass.
 *
 * NOTE: This only removes the declaration line. If `self` is still used later in
 * the same scope, removing the line will cause a ReferenceError. The codemod
 * therefore checks that self is NOT referenced in the same block after the declaration.
 */

'use strict';

const SELF_NAMES = new Set(['self', '_this', 'that', '_self']);

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.VariableDeclaration).forEach(path => {
    const decls = path.node.declarations;
    const toKeep = [];

    for (const decl of decls) {
      if (!decl.id || decl.id.type !== 'Identifier') { toKeep.push(decl); continue; }
      if (!SELF_NAMES.has(decl.id.name)) { toKeep.push(decl); continue; }
      if (!decl.init || decl.init.type !== 'ThisExpression') { toKeep.push(decl); continue; }

      const name = decl.id.name;

      // Check parent block — if `name` is used after this declaration, skip
      const parentBody = path.parent.node.body;
      if (!Array.isArray(parentBody)) { toKeep.push(decl); continue; }

      const stmtIndex = parentBody.indexOf(path.node);
      if (stmtIndex === -1) { toKeep.push(decl); continue; }

      const afterStmts = parentBody.slice(stmtIndex + 1);
      const src = afterStmts.map(s => j(s).toSource()).join(' ');
      // Simple text check — if name appears in later code, don't remove
      const usedAfter = new RegExp(`\\b${name}\\b`).test(src);
      if (usedAfter) { toKeep.push(decl); continue; }

      // Safe to remove
      changed++;
    }

    if (toKeep.length === decls.length) return; // nothing removed
    if (toKeep.length === 0) {
      j(path).remove();
    } else {
      path.node.declarations = toKeep;
    }
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
