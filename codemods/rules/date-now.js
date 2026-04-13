/**
 * SI Referee v2 — Codemod: date-now
 * Rule: javascript:S7759
 * Transforms:
 *   new Date().getTime()    → Date.now()
 *   new Date().valueOf()    → Date.now()
 *   +new Date()             → Date.now()
 *   new Date() * 1          → Date.now()  (numeric coercion)
 *   Number(new Date())      → Date.now()
 */

'use strict';

function isNewDate(node) {
  return node.type === 'NewExpression' &&
         node.callee.type === 'Identifier' &&
         node.callee.name === 'Date' &&
         node.arguments.length === 0;
}

const DATE_NOW = (j) => j.memberExpression(j.identifier('Date'), j.identifier('now'));
const DATE_NOW_CALL = (j) => j.callExpression(DATE_NOW(j), []);

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // new Date().getTime() / new Date().valueOf()
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression' }
  }).forEach(path => {
    const { callee } = path.node;
    if (!isNewDate(callee.object)) return;
    if (callee.property.name !== 'getTime' && callee.property.name !== 'valueOf') return;
    if (path.node.arguments.length !== 0) return;
    j(path).replaceWith(DATE_NOW_CALL(j));
    changed++;
  });

  // +new Date()
  root.find(j.UnaryExpression, { operator: '+' }).forEach(path => {
    if (!isNewDate(path.node.argument)) return;
    j(path).replaceWith(DATE_NOW_CALL(j));
    changed++;
  });

  // Number(new Date())
  root.find(j.CallExpression, {
    callee: { type: 'Identifier', name: 'Number' }
  }).forEach(path => {
    if (path.node.arguments.length !== 1) return;
    if (!isNewDate(path.node.arguments[0])) return;
    j(path).replaceWith(DATE_NOW_CALL(j));
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
