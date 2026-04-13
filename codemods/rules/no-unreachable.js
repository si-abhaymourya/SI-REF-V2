/**
 * SonarQube javascript:S1763
 * Remove unreachable statements after return / throw / break / continue
 *
 * function foo() {
 *   return x;
 *   doSomething(); // ← removed
 * }
 *
 * Conservative:
 *   - Only removes within the same BlockStatement level
 *   - Does not touch labeled breaks or cross-scope jumps
 */
module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  const EXITS = new Set(['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement']);

  root.find(j.BlockStatement).forEach((path) => {
    const body = path.node.body;
    let exitIdx = -1;

    for (let i = 0; i < body.length; i++) {
      if (EXITS.has(body[i].type)) {
        exitIdx = i;
        break;
      }
    }

    if (exitIdx === -1 || exitIdx === body.length - 1) return; // no exit or nothing after

    // Remove everything after the exit statement
    path.node.body = body.slice(0, exitIdx + 1);
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
