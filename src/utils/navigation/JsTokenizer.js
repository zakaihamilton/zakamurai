export function tokenizeJs(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;

  // These token types/values can NOT be the left-hand side of division,
  // so a following `/` must open a regex literal.
  const regexPrecedingValues = new Set([
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '==',
    '===',
    '!=',
    '!==',
    '<',
    '>',
    '<=',
    '>=',
    '&&',
    '||',
    '??',
    '!',
    '~',
    '&',
    '|',
    '^',
    '+',
    '-',
    '*',
    '%',
    '**',
    '(',
    '[',
    '{',
    ',',
    ';',
    ':',
    '?',
    '=>',
    'return',
    'typeof',
    'instanceof',
    'in',
    'void',
    'delete',
    'throw',
    'new',
    'case',
    'yield',
    'await',
  ]);

  function lastMeaningfulToken() {
    return tokens[tokens.length - 1] || null;
  }

  function canBeRegex() {
    const last = lastMeaningfulToken();
    if (!last) return true; // start of file
    if (last.type === 'keyword') return regexPrecedingValues.has(last.value);
    if (last.type === 'punctuator') return regexPrecedingValues.has(last.value);
    return false;
  }

  // Template expression depth stack.
  // Each entry is the brace depth WITHIN that ${...} expression.
  // Pushed when we hit `${`, popped when we see the matching `}`.
  const tmplStack = [];

  while (i < len) {
    const char = code[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Single-line comment
    if (char === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < len && code[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line comment
    if (char === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // Regex literal — must come before the '/' punctuator check
    if (char === '/' && canBeRegex()) {
      const start = i;
      i++; // consume opening '/'
      let inClass = false;
      while (i < len) {
        const c = code[i];
        if (c === '\\') {
          i += 2; // skip escaped char
          continue;
        }
        if (c === '[') {
          inClass = true;
          i++;
          continue;
        }
        if (c === ']') {
          inClass = false;
          i++;
          continue;
        }
        if (c === '/' && !inClass) {
          i++; // consume closing '/'
          // consume flags: g, i, m, s, u, v, y
          while (i < len && /[gimsuy]/.test(code[i])) i++;
          break;
        }
        if (c === '\n') break; // unterminated regex — bail
        i++;
      }
      tokens.push({ type: 'regex', value: code.substring(start, i), start, end: i });
      continue;
    }

    // String literal
    if (char === '"' || char === "'") {
      const quote = char;
      const start = i;
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
        } else if (code[i] === quote) {
          i++;
          break;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'string', value: code.substring(start, i), start, end: i });
      continue;
    }

    // Template literal — scan head (or a subsequent segment after a previous ${...})
    if (char === '`') {
      const start = i;
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
        } else if (code[i] === '`') {
          i++;
          break; // closing backtick
        } else if (code[i] === '$' && code[i + 1] === '{') {
          break; // template expression — stop without consuming
        } else {
          i++;
        }
      }
      tokens.push({ type: 'template_text', value: code.substring(start, i), start, end: i });
      // If we stopped at ${, record it and push onto the template stack
      if (i < len && code[i] === '$' && code[i + 1] === '{') {
        tmplStack.push(0);
        tokens.push({ type: 'punctuator', value: '${', start: i, end: i + 2 });
        i += 2;
      }
      continue;
    }

    // `{` — also increment template-expression brace depth when inside one
    if (char === '{') {
      if (tmplStack.length > 0) tmplStack[tmplStack.length - 1]++;
      tokens.push({ type: 'punctuator', value: '{', start: i, end: i + 1 });
      i++;
      continue;
    }

    // `}` — may close a template expression OR be a normal closing brace
    if (char === '}') {
      if (tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === 0) {
        // Closes the innermost template expression
        tmplStack.pop();
        tokens.push({ type: 'template_close', value: '}', start: i, end: i + 1 });
        i++;
        // Scan the template tail until closing ` or another ${
        const tailStart = i;
        while (i < len) {
          if (code[i] === '\\') {
            i += 2;
          } else if (code[i] === '`') {
            i++;
            break;
          } else if (code[i] === '$' && code[i + 1] === '{') {
            break;
          } else {
            i++;
          }
        }
        tokens.push({
          type: 'template_text',
          value: code.substring(tailStart, i),
          start: tailStart,
          end: i,
        });
        if (i < len && code[i] === '$' && code[i + 1] === '{') {
          tmplStack.push(0);
          tokens.push({ type: 'punctuator', value: '${', start: i, end: i + 2 });
          i += 2;
        }
        continue;
      }
      // Normal `}` (may be inside a template expression but with nested braces)
      if (tmplStack.length > 0) tmplStack[tmplStack.length - 1]--;
      tokens.push({ type: 'punctuator', value: '}', start: i, end: i + 1 });
      i++;
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_$]/.test(char)) {
      const start = i;
      i++;
      while (i < len && /[a-zA-Z0-9_$]/.test(code[i])) {
        i++;
      }
      const value = code.substring(start, i);
      const keywords = new Set([
        'const',
        'let',
        'var',
        'function',
        'class',
        'try',
        'catch',
        'import',
        'export',
        'default',
        'return',
        'if',
        'else',
        'for',
        'while',
        'do',
        'switch',
        'case',
        'break',
        'continue',
        'new',
        'this',
        'typeof',
        'void',
        'delete',
        'in',
        'instanceof',
        'async',
        'await',
      ]);
      tokens.push({
        type: keywords.has(value) ? 'keyword' : 'identifier',
        value,
        start,
        end: i,
      });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const start = i;
      i++;
      while (i < len && /[0-9a-fA-F\.xX]/.test(code[i])) {
        i++;
      }
      tokens.push({ type: 'number', value: code.substring(start, i), start, end: i });
      continue;
    }

    // Punctuators — `{`, `}`, `${` are handled above with template-stack awareness
    const punctuators = [
      '=>',
      '===',
      '!==',
      '==',
      '!=',
      '>=',
      '<=',
      '++',
      '--',
      '+',
      '-',
      '*',
      '/',
      '%',
      '&',
      '|',
      '^',
      '!',
      '~',
      '?',
      ':',
      '(',
      ')',
      '[',
      ']',
      '.',
      ',',
      ';',
      '=',
    ];
    let matched = false;
    for (const p of punctuators) {
      if (code.substring(i, i + p.length) === p) {
        tokens.push({ type: 'punctuator', value: p, start: i, end: i + p.length });
        i += p.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: 'punctuator', value: char, start: i, end: i + 1 });
      i++;
    }
  }

  return tokens;
}
