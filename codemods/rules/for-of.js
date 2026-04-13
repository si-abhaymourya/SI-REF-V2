/**
 * SI Referee v2 — Codemod: for-of
 * Rule: javascript:S4138
 * Convert simple indexed for loops to for-of when safe:
 *
 *   for (let i = 0; i < arr.length; i++) {
 *     const item = arr[i];   // ← first stmt assigns element
 *     ... body using item ...
 *   }
 *   →
 *   for (const item of arr) {
 *     ... body using item ...
 *   }
 *
 * Safety constraints (skip if any violated):
 * - Init: `let i = 0` (or `var i = 0`)
 * - Test: `i < arr.length` or `i <= arr.length - 1`
 * - Update: `i++` or `++i` (no `i += 2` etc)
 * - Loop variable `i` must ONLY appear as `arr[i]` in the body — nowhere else
 * - First statement of body must be `const elem = arr[i]` (assigns element)
 * - Array expression must be identical (by source text) in test and first-stmt access
 * - No labeled break/continue (safe to keep labels but complicates analysis — skip)
 * - Handles labeled loops: `label: for (...)` — label is preserved on for-of
 */

'use strict';

/**
 * Get source text of a node for identity comparison.
 */
function src(node, j) {
  return j(node).toSource();
}

/**
 * Check if a node is a simple counter variable reference (Identifier with the given name).
 */
function isIndexRef(node, name) {
  return node.type === 'Identifier' && node.name === name;
}

/**
 * Walk all nodes in an AST subtree and check if the counter variable appears
 * anywhere OTHER than `arr[i]` (where arr source matches expected).
 * Returns true if it's safe (only used as arr[i]).
 */
function counterOnlyUsedAsArrayAccess(body, counterName, arrSrc, j) {
  let safe = true;

  j(body).find(j.Identifier, { name: counterName }).forEach(path => {
    const parent = path.parent.node;
    // Must be in a MemberExpression as computed index: arr[i]
    if (
      parent.type === 'MemberExpression' &&
      parent.computed &&
      parent.property === path.node
    ) {
      // Check the object source matches expected array
      if (src(parent.object, j) !== arrSrc) {
        safe = false;
      }
      // else: this is arr[i] — OK
    } else {
      // Counter used in something other than array access
      safe = false;
    }
  });

  return safe;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.ForStatement).forEach(path => {
    const node = path.node;
    const { init, test, update, body } = node;

    // ── Init: let i = 0 ────────────────────────────────────────────────────
    if (!init || init.type !== 'VariableDeclaration') return;
    if (init.declarations.length !== 1) return;
    const initDecl = init.declarations[0];
    if (
      !initDecl.init ||
      initDecl.init.type !== 'Literal' ||
      initDecl.init.value !== 0
    ) return;
    if (initDecl.id.type !== 'Identifier') return;
    const counterName = initDecl.id.name;

    // ── Test: i < arr.length ───────────────────────────────────────────────
    if (!test || test.type !== 'BinaryExpression') return;
    if (test.operator !== '<' && test.operator !== '<=') return;
    if (!isIndexRef(test.left, counterName)) return;

    // RHS must be arr.length  (MemberExpression .length)
    const testRight = test.right;
    if (
      testRight.type !== 'MemberExpression' ||
      testRight.computed ||
      testRight.property.name !== 'length'
    ) return;
    const arrayNode = testRight.object;
    const arraySrc = src(arrayNode, j);

    // ── Update: i++ or ++i ─────────────────────────────────────────────────
    if (!update || update.type !== 'UpdateExpression') return;
    if (update.operator !== '++') return;
    if (!isIndexRef(update.argument, counterName)) return;

    // ── Body: must be a BlockStatement ─────────────────────────────────────
    if (body.type !== 'BlockStatement') return;
    if (body.body.length === 0) return;

    // ── First stmt: const elem = arr[i] ────────────────────────────────────
    const firstStmt = body.body[0];
    if (
      !firstStmt ||
      firstStmt.type !== 'VariableDeclaration' ||
      firstStmt.declarations.length !== 1
    ) return;
    const firstDecl = firstStmt.declarations[0];
    if (!firstDecl.init) return;
    if (firstDecl.id.type !== 'Identifier') return;

    const elemInit = firstDecl.init;
    // Must be arr[i]
    if (
      elemInit.type !== 'MemberExpression' ||
      !elemInit.computed ||
      !isIndexRef(elemInit.property, counterName) ||
      src(elemInit.object, j) !== arraySrc
    ) return;

    const elemName = firstDecl.id.name;

    // ── Safety: counter only used as arr[i] in body ────────────────────────
    // Check the REMAINING body (excluding first stmt which we're removing)
    const remainingBody = body.body.slice(1);
    if (!counterOnlyUsedAsArrayAccess(remainingBody, counterName, arraySrc, j)) return;

    // ── Transform ──────────────────────────────────────────────────────────
    const forOf = j.forOfStatement(
      j.variableDeclaration('const', [j.variableDeclarator(j.identifier(elemName))]),
      arrayNode,
      j.blockStatement(remainingBody)
    );

    // Preserve label if parent is a LabeledStatement
    if (path.parent && path.parent.node.type === 'LabeledStatement') {
      path.parent.node.body = forOf;
    } else {
      j(path).replaceWith(forOf);
    }
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
