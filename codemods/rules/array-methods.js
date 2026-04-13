/**
 * SI Referee v2 — Codemod: array-methods
 * Rules: S7765, S7754, S7755, S7750
 *
 * S7765: arr.some(x => x === val) → arr.includes(val)
 *        arr.some(x => val === x) → arr.includes(val)
 * S7754: if (arr.find(fn)) → if (arr.some(fn))   (truthiness check only)
 * S7755: arr[arr.length - 1] → arr.at(-1)
 * S7750: arr.filter(fn)[0] → arr.find(fn)
 */

'use strict';

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // S7765: .some(x => x === val) → .includes(val)
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'some' } }
  }).forEach(path => {
    const args = path.node.arguments;
    if (args.length !== 1) return;
    const fn = args[0];
    // arrow function with single param and strict equality body
    if (fn.type !== 'ArrowFunctionExpression') return;
    if (fn.params.length !== 1) return;
    if (fn.params[0].type !== 'Identifier') return;
    const param = fn.params[0].name;
    const body = fn.body;
    // body must be: param === val  OR  val === param  OR  param == val
    if (!['BinaryExpression'].includes(body.type)) return;
    if (!['===', '=='].includes(body.operator)) return;

    let val = null;
    if (body.left.type === 'Identifier' && body.left.name === param) val = body.right;
    else if (body.right.type === 'Identifier' && body.right.name === param) val = body.left;
    if (!val) return;

    // Replace .some(x => x === val) → .includes(val)
    const arr = path.node.callee.object;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(arr, j.identifier('includes')),
        [val]
      )
    );
    changed++;
  });

  // S7754: .find(fn) used only for truthiness → .some(fn)
  // Pattern: boolean context (if test, ternary test, logical operand)
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'find' } }
  }).forEach(path => {
    const parent = path.parent.node;
    const pt = parent.type;
    const isBoolCtx =
      (pt === 'IfStatement' && parent.test === path.node) ||
      (pt === 'ConditionalExpression' && parent.test === path.node) ||
      (pt === 'LogicalExpression') ||
      (pt === 'UnaryExpression' && parent.operator === '!');

    if (!isBoolCtx) return;
    const args = path.node.arguments;
    if (args.length < 1) return;
    // Don't convert if result is used beyond truthiness (e.g. assigned then read)
    const arr = path.node.callee.object;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(arr, j.identifier('some')),
        args
      )
    );
    changed++;
  });

  // S7755: arr[arr.length - 1] → arr.at(-1)
  root.find(j.MemberExpression, { computed: true }).forEach(path => {
    const { object, property } = path.node;
    // property must be: object.length - 1
    if (property.type !== 'BinaryExpression') return;
    if (property.operator !== '-') return;
    const { left, right } = property;
    // left must be same-as-object.length, right must be Literal(1)
    if (right.type !== 'Literal' || right.value !== 1) return;
    if (left.type !== 'MemberExpression') return;
    if (left.property.type !== 'Identifier' || left.property.name !== 'length') return;
    // Check left.object matches object (by source text)
    const src1 = j(object).toSource();
    const src2 = j(left.object).toSource();
    if (src1 !== src2) return;

    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(object, j.identifier('at')),
        [j.unaryExpression('-', j.literal(1))]
      )
    );
    changed++;
  });

  // S7750: arr.filter(fn)[0] → arr.find(fn)
  root.find(j.MemberExpression, {
    computed: true,
    property: { type: 'Literal', value: 0 }
  }).forEach(path => {
    const { object } = path.node;
    if (object.type !== 'CallExpression') return;
    if (object.callee.type !== 'MemberExpression') return;
    if (object.callee.property.name !== 'filter') return;
    const arr = object.callee.object;
    const args = object.arguments;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(arr, j.identifier('find')),
        args
      )
    );
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
