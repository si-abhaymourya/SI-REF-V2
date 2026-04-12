/**
 * SonarQube javascript:S3504
 * Converts `var` declarations to `const` or `let`.
 * - const  → never reassigned after declaration
 * - let    → reassigned at least once
 * - skips  → for-loop inits, global scope, destructured vars with complex patterns
 */
module.exports = function (fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.VariableDeclaration, { kind: 'var' }).forEach((path) => {
    // Skip global scope (program body direct children) — could break scripts
    if (path.parent.node.type === 'Program') return;

    // Skip for-loop init — for(var i…) semantics differ from let
    const parent = path.parent.node;
    if (parent.type === 'ForStatement' || parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') return;

    // Skip multi-declarator var with complex patterns for safety
    if (path.node.declarations.length > 1) {
      // Still safe if none are reassigned
    }

    const allDeclarators = path.node.declarations;
    const allConst = allDeclarators.every((decl) => {
      if (!decl.id || decl.id.type !== 'Identifier') return false; // skip destructure patterns
      const name = decl.id.name;
      return !isReassigned(name, path, j);
    });

    const allHaveSimpleId = allDeclarators.every((d) => d.id && d.id.type === 'Identifier');
    if (!allHaveSimpleId) return; // skip destructuring for safety

    path.node.kind = allConst ? 'const' : 'let';
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};

function isReassigned(name, varPath, j) {
  // Walk up to find the containing function/block scope
  let scope = varPath;
  while (scope && !isScopeNode(scope.node)) {
    scope = scope.parent;
  }
  if (!scope) return false;

  let reassigned = false;

  j(scope.node).find(j.AssignmentExpression).forEach((path) => {
    if (reassigned) return;
    const left = path.node.left;
    if (left.type === 'Identifier' && left.name === name) reassigned = true;
    // Handle compound assignment: x += 1
  });

  if (!reassigned) {
    j(scope.node).find(j.UpdateExpression).forEach((path) => {
      if (reassigned) return;
      if (path.node.argument.type === 'Identifier' && path.node.argument.name === name) reassigned = true;
    });
  }

  if (!reassigned) {
    // Check for-loop reassignment patterns
    j(scope.node).find(j.ForStatement).forEach((path) => {
      if (reassigned) return;
      const update = path.node.update;
      if (update && update.type === 'AssignmentExpression' && update.left.type === 'Identifier' && update.left.name === name) {
        reassigned = true;
      }
    });
  }

  return reassigned;
}

function isScopeNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'Program'
  );
}
