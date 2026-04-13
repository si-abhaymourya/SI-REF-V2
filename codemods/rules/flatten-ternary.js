/**
 * SI Referee v2 — Codemod: flatten-ternary
 * Rule: javascript:S3358
 * Flatten nested ternary chains into if/else statements.
 *
 * Pattern A (variable declaration):
 *   const x = a ? v1 : b ? v2 : v3;
 *   → let x;
 *     if (a) x = v1;
 *     else if (b) x = v2;
 *     else x = v3;
 *
 * Pattern B (assignment expression statement):
 *   x = a ? v1 : b ? v2 : v3;
 *   → if (a) x = v1;
 *     else if (b) x = v2;
 *     else x = v3;
 *
 * Safety constraints (skip if any violated):
 * - The ternary must be the ENTIRE value (not nested inside another expression)
 * - All branch values must be "simple" — literals, identifiers, simple member exprs, template literals
 *   (no function calls, no nested ternaries in values)
 * - Only handles 2+ level nesting (at least one alternate is itself a ternary)
 * - const → let when converting variable declaration (required for if/else assignment)
 */

'use strict';

/**
 * Check if a node is a "simple" leaf value (safe to hoist into if/else branch).
 * Excludes: function calls, complex expressions, nested ternaries.
 */
function isSimpleValue(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'TemplateLiteral':
      return true;
    case 'MemberExpression':
      // Allow simple member access: obj.prop (not computed, not deeply chained calls)
      return !node.computed && isSimpleValue(node.object);
    case 'UnaryExpression':
      return node.operator === '!' || node.operator === '-';
    default:
      return false;
  }
}

/**
 * Check if a ConditionalExpression is a "simple chain" suitable for Pattern A:
 * - Alternates chain downward (a?x:b?y:z)
 * - All consequent values are simple
 * - Final alternate is simple
 * - No nested ternaries in test positions
 */
function isSimpleChain(node) {
  if (node.type !== 'ConditionalExpression') return false;
  // Must have at least one nested alternate (otherwise it's a plain ternary, not nested)
  if (node.alternate.type !== 'ConditionalExpression') return false;

  let current = node;
  while (current.type === 'ConditionalExpression') {
    // Consequent must be simple
    if (!isSimpleValue(current.consequent)) return false;
    // Test should not itself be a ternary
    if (current.test.type === 'ConditionalExpression') return false;
    current = current.alternate;
  }
  // Final else value must be simple
  return isSimpleValue(current);
}

/**
 * Flatten a ConditionalExpression chain into [{test, value}] branches + final else value.
 */
function flattenChain(node) {
  const branches = [];
  let current = node;
  while (current.type === 'ConditionalExpression') {
    branches.push({ test: current.test, value: current.consequent });
    current = current.alternate;
  }
  return { branches, elseValue: current };
}

/**
 * Build an if/else chain from flattened branches.
 * Each branch does: target = value  (AssignmentExpression as ExpressionStatement)
 * OR: return value  (ReturnStatement)
 */
function buildIfElse(j, branches, elseValue, makeStatement) {
  // Build from the bottom up, using direct IfStatement as alternate (else if — no wrapping block)
  let result = j.ifStatement(
    branches[branches.length - 1].test,
    j.blockStatement([makeStatement(branches[branches.length - 1].value)]),
    j.blockStatement([makeStatement(elseValue)])
  );

  for (let i = branches.length - 2; i >= 0; i--) {
    result = j.ifStatement(
      branches[i].test,
      j.blockStatement([makeStatement(branches[i].value)]),
      result   // direct IfStatement as alternate = "else if" (no wrapping BlockStatement)
    );
  }

  return result;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Pattern A: VariableDeclaration with a single declarator whose init is a nested ternary chain
  // const x = a ? v1 : b ? v2 : v3;
  root.find(j.VariableDeclaration).forEach(path => {
    const decl = path.node;
    if (decl.declarations.length !== 1) return; // skip multi-declarators

    const declarator = decl.declarations[0];
    if (!declarator.init) return;
    if (!isSimpleChain(declarator.init)) return;

    // Check the declarator id is a simple identifier (not destructuring)
    if (declarator.id.type !== 'Identifier') return;

    const varName = declarator.id.name;
    const { branches, elseValue } = flattenChain(declarator.init);

    // Build: let varName; if (...) varName = ...; else if (...) varName = ...; else varName = ...;
    const makeAssign = (value) => j.expressionStatement(
      j.assignmentExpression('=', j.identifier(varName), value)
    );

    const ifChain = buildIfElse(j, branches, elseValue, makeAssign);

    // Replace with: let varName; <ifChain>
    const letDecl = j.variableDeclaration('let', [
      j.variableDeclarator(j.identifier(varName), null)
    ]);

    // Insert both nodes in place of the original declaration
    // We need to insert the if chain AFTER the let declaration in the parent block
    const parentBody = path.parent.node.body;
    if (!Array.isArray(parentBody)) return; // not in a block — skip

    const idx = parentBody.indexOf(path.node);
    if (idx === -1) return;

    parentBody.splice(idx, 1, letDecl, ifChain);
    changed++;
  });

  // Pattern B: ExpressionStatement that is an assignment expression where RHS is a nested ternary
  // x = a ? v1 : b ? v2 : v3;
  root.find(j.ExpressionStatement).forEach(path => {
    const stmt = path.node;
    if (stmt.expression.type !== 'AssignmentExpression') return;
    const assign = stmt.expression;
    if (assign.operator !== '=') return;
    if (!isSimpleChain(assign.right)) return;

    // LHS must be simple (identifier or simple member expr)
    if (!isSimpleValue(assign.left) && assign.left.type !== 'Identifier' && assign.left.type !== 'MemberExpression') return;

    const lhs = assign.left;
    const { branches, elseValue } = flattenChain(assign.right);

    const makeAssign = (value) => j.expressionStatement(
      j.assignmentExpression('=', lhs, value)
    );

    const ifChain = buildIfElse(j, branches, elseValue, makeAssign);

    j(path).replaceWith(ifChain);
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
