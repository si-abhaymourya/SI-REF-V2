/**
 * SI Referee v2 — Codemod: regexp-charclass
 * Rule: javascript:S6353
 * Replace verbose character classes with shorthand equivalents inside regex literals:
 *   [0-9]          → \d
 *   [^0-9]         → \D
 *   [a-zA-Z0-9_]   → \w
 *   [^a-zA-Z0-9_]  → \W
 *
 * Safety: only applies inside regex literal pattern strings, not inside strings.
 * Skips if the character class contains additional chars beyond the mapping.
 */

'use strict';

const REPLACEMENTS = [
  // Order matters — more specific patterns first
  { from: /\[0-9\]/g,           to: '\\d' },
  { from: /\[\^0-9\]/g,         to: '\\D' },
  { from: /\[a-zA-Z0-9_\]/g,   to: '\\w' },
  { from: /\[a-zA-Z0-9_\]/g,   to: '\\w' },
  { from: /\[\^a-zA-Z0-9_\]/g, to: '\\W' },
  { from: /\[A-Za-z0-9_\]/g,   to: '\\w' },
  { from: /\[\^A-Za-z0-9_\]/g, to: '\\W' },
];

function transformPattern(pattern) {
  let result = pattern;
  for (const { from, to } of REPLACEMENTS) {
    result = result.replace(from, to);
  }
  return result;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = 0;

  // Find regex literals: /pattern/flags
  root.find(j.Literal).forEach(path => {
    const node = path.node;
    // A regex literal has a `regex` property
    if (!node.regex) return;

    const { pattern, flags } = node.regex;
    const newPattern = transformPattern(pattern);
    if (newPattern === pattern) return;

    // Validate new regex is still valid
    try {
      new RegExp(newPattern, flags);
    } catch (e) {
      return;
    }

    // Replace with updated regex literal
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
