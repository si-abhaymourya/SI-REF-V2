/**
 * SI Referee v2 — Codemod: no-redundant-escape
 * Rule: javascript:S6535
 * Remove unnecessary escape characters from regex literals.
 *
 * A character is unnecessarily escaped when it has no special meaning in that context
 * (inside or outside a character class) and the unescaped version behaves identically.
 *
 * Special chars OUTSIDE character class [ ]:
 *   . * + ? ^ $ { } [ ] ( ) | \  /
 * Everything else is safe to unescape.
 *
 * Special chars INSIDE character class [ ]:
 *   ] \ ^(at start) -(between two chars as range)
 *
 * Safety: skips if removing the escape would change the regex semantics
 * (e.g. \- between two chars inside a class would become a range).
 */

'use strict';

// Chars that are special OUTSIDE a character class — keep their escapes
const SPECIAL_OUTSIDE = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '[', ']', '(', ')', '|', '\\', '/']);

// Chars that are special INSIDE a character class — keep their escapes
// Note: '-' is handled separately (range detection)
const SPECIAL_INSIDE = new Set([']', '\\', '^']);

/**
 * Parse the regex pattern string and remove unnecessary backslash escapes.
 * Returns the modified pattern string (or the original if no changes).
 */
function removeUnnecessaryEscapes(pattern) {
  let result = '';
  let i = 0;
  let insideClass = false;
  let classStart = false; // true right after [ (for ^ detection)

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];

      // Never strip: \d \w \s \D \W \S \b \B \0 \n \r \t \v \f
      // and back-references \1-\9, named groups \k, \u, \x, \p, \P, \c, \a
      const isEscapeSequence = /[dwsDWSbB0nrtvfkuxpPca1-9]/.test(next);
      if (isEscapeSequence) {
        result += ch + next;
        i += 2;
        continue;
      }

      if (insideClass) {
        // Inside [...]: check if escape is necessary
        if (SPECIAL_INSIDE.has(next)) {
          // ] \\ ^ are special inside — keep escape
          result += ch + next;
        } else if (next === '-') {
          // '-' is only special as a range indicator between two non-special chars.
          // If escaped (\-), it's always a literal hyphen.
          // If unescaped (-) and NOT at start/end of class, it could be a range.
          // To be safe: only unescape if prev char in result ends with ] or ^ or is the open [ itself.
          // Strategy: only unescape \- if it appears at a position where unescaped - would also be literal.
          // Simplest safe rule: only unescape \- when it's at the very end of a class before ]
          // We can't easily check ahead without a full parse; skip to be safe.
          result += ch + next;
        } else {
          // Not special inside class — remove the backslash
          result += next;
        }
      } else {
        // Outside [...]: check if escape is necessary
        if (SPECIAL_OUTSIDE.has(next)) {
          // Special chars outside — keep escape
          result += ch + next;
        } else {
          // Not special outside — remove the backslash
          result += next;
        }
      }
      i += 2;
      continue;
    }

    // Track character class state
    if (!insideClass && ch === '[') {
      insideClass = true;
      classStart = true;
      result += ch;
      i++;
      continue;
    }

    if (insideClass) {
      if (classStart && ch === '^') {
        // negated class — stays inside class
        classStart = false;
        result += ch;
        i++;
        continue;
      }
      classStart = false;
      if (ch === ']') {
        insideClass = false;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  root.find(j.Literal).forEach(path => {
    const node = path.node;
    if (!node.regex) return; // Only regex literals

    const { pattern, flags } = node.regex;
    const newPattern = removeUnnecessaryEscapes(pattern);
    if (newPattern === pattern) return;

    // Validate the new regex is syntactically valid and semantically identical-ish
    try {
      new RegExp(newPattern, flags);
    } catch (e) {
      return; // Skip if invalid
    }

    const newRegexObj = new RegExp(newPattern, flags);
    j(path).replaceWith({
      type: 'Literal',
      value: newRegexObj,
      regex: { pattern: newPattern, flags },
      raw: `/${newPattern}/${flags}`,
    });
    changed++;
  });

  if (changed === 0) return file.source;
  return root.toSource({ quote: 'single' });
};
