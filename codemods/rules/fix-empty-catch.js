/**
 * SonarQube javascript:S2486
 * Handle this exception or don't catch it at all.
 *
 * Transforms empty catch blocks to log the error:
 *   catch (e) {}
 *   → catch (e) { console.error('functionName', e); }
 *
 * Also cleans up our previously-added sentinel `void 0` blocks.
 *
 * Function name is resolved from the nearest containing named function/method.
 * Falls back to just console.error(e) if no name can be found.
 */

'use strict';

/**
 * Walk up the AST to find the nearest containing function name.
 * Returns a string or null.
 */
function getFunctionName(path) {
  let current = path.parent;
  while (current) {
    const node = current.node;

    // function foo() {} or const foo = function foo() {}
    if (
      (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
      node.id && node.id.name
    ) {
      return node.id.name;
    }

    // const foo = function() {} / const foo = () => {}
    if (
      node.type === 'VariableDeclarator' &&
      node.id && node.id.type === 'Identifier' &&
      (node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression'))
    ) {
      return node.id.name;
    }

    // foo: function() {} (object method shorthand or property)
    if (
      node.type === 'Property' &&
      node.key && node.key.type === 'Identifier'
    ) {
      return node.key.name;
    }

    // foo() {} (class method or object method shorthand)
    if (
      node.type === 'MethodDefinition' &&
      node.key && node.key.type === 'Identifier'
    ) {
      return node.key.name;
    }

    // foo: function() {} in expression assignment: this.foo = function() {}
    if (
      node.type === 'AssignmentExpression' &&
      node.left && node.left.type === 'MemberExpression' &&
      node.left.property && node.left.property.type === 'Identifier'
    ) {
      return node.left.property.name;
    }

    current = current.parent;
  }
  return null;
}

/**
 * Check if a catch block body is "effectively empty":
 * - Zero statements, OR
 * - Only contains our previously-added `void 0` sentinel
 */
function isEffectivelyEmpty(body) {
  if (body.length === 0) return true;
  if (body.length === 1) {
    const stmt = body[0];
    // Our old sentinel: expression statement with `void 0`
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'UnaryExpression' &&
      stmt.expression.operator === 'void' &&
      stmt.expression.argument.type === 'Literal' &&
      stmt.expression.argument.value === 0
    ) {
      return true;
    }
  }
  return false;
}

module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = 0;

  root.find(j.CatchClause).forEach((path) => {
    if (!isEffectivelyEmpty(path.node.body.body)) return;

    // Get the error variable name from catch (e) — default to 'error'
    const errorParam = path.node.param;
    const errorName = (errorParam && errorParam.type === 'Identifier')
      ? errorParam.name
      : 'error';

    // Get surrounding function name
    const funcName = getFunctionName(path);

    // Build: console.error('funcName', e)  OR  console.error(e)
    let callArgs;
    if (funcName) {
      callArgs = [
        j.literal(funcName),
        j.identifier(errorName),
      ];
    } else {
      callArgs = [j.identifier(errorName)];
    }

    const consoleError = j.expressionStatement(
      j.callExpression(
        j.memberExpression(j.identifier('console'), j.identifier('error')),
        callArgs
      )
    );

    path.node.body.body = [consoleError];
    changed++;
  });

  return changed > 0 ? root.toSource({ quote: 'single' }) : null;
};
