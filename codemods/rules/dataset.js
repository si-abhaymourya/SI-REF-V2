/**
 * SI Referee v2 — Codemod: dataset
 * Rule: javascript:S7761
 * Transform: el.getAttribute('data-foo-bar') → el.dataset.fooBar
 *            el.setAttribute('data-foo-bar', val) → el.dataset.fooBar = val
 *            el.removeAttribute('data-foo-bar') → delete el.dataset.fooBar
 *
 * Safety: skips any data-* attribute with uppercase letters (camelCase in HTML = unsafe).
 * Only handles kebab-case data attributes (e.g. data-video-id, data-url).
 */

'use strict';

const REGEX_SPECIAL = /[A-Z]/;

/**
 * Convert kebab-case attr name (without data- prefix) to camelCase dataset key.
 * e.g. "video-id" → "videoId", "url" → "url"
 */
function toCamelCase(kebab) {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Returns the dataset key for a data-* attribute string, or null if unsafe.
 * e.g. "data-video-id" → "videoId"
 *      "data-seriesList" → null (has uppercase)
 */
function datasetKey(attrName) {
  if (!attrName.startsWith('data-')) return null;
  const rest = attrName.slice(5); // strip "data-"
  if (REGEX_SPECIAL.test(rest)) return null; // camelCase in attr name — skip
  if (!rest) return null;
  return toCamelCase(rest);
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // getAttribute('data-*') → .dataset.*
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'getAttribute' } }
  }).forEach(path => {
    const args = path.node.arguments;
    if (args.length !== 1) return;
    const arg = args[0];
    if (arg.type !== 'StringLiteral' && arg.type !== 'Literal') return;
    const attrName = arg.value;
    const key = datasetKey(attrName);
    if (!key) return;

    // Replace: el.getAttribute('data-foo') → el.dataset.foo
    const obj = path.node.callee.object;
    j(path).replaceWith(
      j.memberExpression(
        j.memberExpression(obj, j.identifier('dataset')),
        j.identifier(key)
      )
    );
    changed++;
  });

  // setAttribute('data-*', val) → .dataset.* = val
  // Must be an ExpressionStatement to safely replace
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'setAttribute' } }
  }).forEach(path => {
    const args = path.node.arguments;
    if (args.length !== 2) return;
    const arg = args[0];
    if (arg.type !== 'StringLiteral' && arg.type !== 'Literal') return;
    const attrName = arg.value;
    const key = datasetKey(attrName);
    if (!key) return;

    // Only replace when the call is a standalone expression statement
    if (path.parent.node.type !== 'ExpressionStatement') return;

    const obj = path.node.callee.object;
    const val = args[1];
    j(path.parent).replaceWith(
      j.expressionStatement(
        j.assignmentExpression(
          '=',
          j.memberExpression(
            j.memberExpression(obj, j.identifier('dataset')),
            j.identifier(key)
          ),
          val
        )
      )
    );
    changed++;
  });

  // removeAttribute('data-*') → delete .dataset.*
  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { name: 'removeAttribute' } }
  }).forEach(path => {
    const args = path.node.arguments;
    if (args.length !== 1) return;
    const arg = args[0];
    if (arg.type !== 'StringLiteral' && arg.type !== 'Literal') return;
    const attrName = arg.value;
    const key = datasetKey(attrName);
    if (!key) return;

    if (path.parent.node.type !== 'ExpressionStatement') return;

    const obj = path.node.callee.object;
    j(path.parent).replaceWith(
      j.expressionStatement(
        j.unaryExpression(
          'delete',
          j.memberExpression(
            j.memberExpression(obj, j.identifier('dataset')),
            j.identifier(key)
          )
        )
      )
    );
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
