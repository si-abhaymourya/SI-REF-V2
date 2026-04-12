/**
 * SonarQube javascript:S3257
 * Removes unnecessary spread in object/array literals
 * e.g. { ...{a: 1} } → { a: 1 }
 *      [...[1, 2]] → [1, 2]  (only when wrapping an array literal)
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  // { ...{a, b} } → { a, b }
  root.find(j.ObjectExpression).forEach((objPath) => {
    const newProps = [];
    let didChange = false;

    objPath.node.properties.forEach((prop) => {
      if (
        prop.type === 'SpreadElement' &&
        prop.argument.type === 'ObjectExpression'
      ) {
        // Inline the inner object's properties
        newProps.push(...prop.argument.properties);
        didChange = true;
      } else {
        newProps.push(prop);
      }
    });

    if (didChange) {
      objPath.node.properties = newProps;
      changed++;
    }
  });

  // [...[1, 2, 3]] → [1, 2, 3]  (only top-level spread of array literal)
  root.find(j.ArrayExpression).forEach((arrPath) => {
    // Only when array has exactly one element that is a spread of an array literal
    const elems = arrPath.node.elements;
    if (
      elems.length === 1 &&
      elems[0] &&
      elems[0].type === 'SpreadElement' &&
      elems[0].argument.type === 'ArrayExpression'
    ) {
      arrPath.node.elements = elems[0].argument.elements;
      changed++;
    }
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
