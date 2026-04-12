/**
 * SonarQube javascript:S1116
 * Removes empty statements (standalone semicolons that do nothing)
 * Skips empty bodies of for/while loops (sometimes intentional busy-wait)
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.EmptyStatement).forEach((path) => {
    const parent = path.parent.node;
    // Keep empty bodies in loops/if — removing could change semantics
    const keepParents = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'IfStatement', 'LabeledStatement']);
    if (keepParents.has(parent.type)) return;

    j(path).remove();
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
