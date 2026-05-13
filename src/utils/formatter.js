/**
 * Simple code formatter for JS, CSS, and JSON to ensure correct indentation.
 */

/**
 * Formats the given code based on the file path extension.
 *
 * @param {string} code - The code to format
 * @param {string} filePath - The path to the file (to determine language)
 * @returns {string} - The formatted code
 */
export function formatCode(code, filePath) {
  if (!code) return code;
  const ext = filePath.split('.').pop().toLowerCase();

  if (ext === 'json') {
    try {
      // JSON is easy to format using built-in stringify
      const obj = JSON.parse(code);
      return JSON.stringify(obj, null, 2);
    } catch (_e) {
      // If JSON is invalid, return as is
      return code;
    }
  }

  if (
    ext === 'css' ||
    ext === 'js' ||
    ext === 'jsx' ||
    ext === 'ts' ||
    ext === 'tsx' ||
    ext === 'jss'
  ) {
    return indentCode(code);
  }

  return code;
}

/**
 * A basic indentation-based formatter that tracks brackets and braces.
 * Properly handles strings, comments, and JSX tags.
 */
function indentCode(code) {
  const lines = code.split('\n');
  let indentLevel = 0;
  let state = {
    inBlockComment: false,
    inSingleQuote: false,
    inDoubleQuote: false,
    inBacktick: false,
  };

  const formatted = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Decrease indent BEFORE the line if it starts with closing elements
    let decreaseThisLine = 0;
    if (!state.inBlockComment && !state.inSingleQuote && !state.inDoubleQuote && !state.inBacktick) {
      let tempTrimmed = trimmed;
      while (tempTrimmed.length > 0) {
        if (/^[\}\]\)]/.test(tempTrimmed)) {
          decreaseThisLine++;
          tempTrimmed = tempTrimmed.substring(1);
        } else if (tempTrimmed.startsWith('</') || tempTrimmed.startsWith('/>')) {
          decreaseThisLine++;
          tempTrimmed = tempTrimmed.substring(2);
        } else if (
          tempTrimmed.startsWith('>') &&
          !tempTrimmed.startsWith('>=') &&
          !tempTrimmed.startsWith('>>')
        ) {
          decreaseThisLine++;
          tempTrimmed = tempTrimmed.substring(1);
        } else {
          break;
        }
      }
    }

    const currentIndent = Math.max(0, indentLevel - decreaseThisLine);
    const newLine = '  '.repeat(currentIndent) + trimmed;

    // Update state and indentLevel for the NEXT line
    const result = analyzeLine(line, state);
    indentLevel += result.opening - result.closing;
    state = result.state;

    return newLine;
  });

  return formatted.join('\n');
}

/**
 * Analyzes a line char-by-char to determine indentation changes and track state.
 */
function analyzeLine(line, initialState) {
  let opening = 0;
  let closing = 0;
  const state = { ...initialState };
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    // Handle block comments
    if (state.inBlockComment) {
      if (char === '*' && nextChar === '/') {
        state.inBlockComment = false;
        i++;
      }
      continue;
    }

    // Handle strings
    if (state.inSingleQuote) {
      if (char === "'") state.inSingleQuote = false;
      continue;
    }
    if (state.inDoubleQuote) {
      if (char === '"') state.inDoubleQuote = false;
      continue;
    }
    if (state.inBacktick) {
      if (char === '`') state.inBacktick = false;
      continue;
    }

    // Start of block comment
    if (char === '/' && nextChar === '*') {
      state.inBlockComment = true;
      i++;
      continue;
    }

    // Line comment
    if (char === '/' && nextChar === '/') {
      break;
    }

    // Start of string
    if (char === "'") {
      state.inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      state.inDoubleQuote = true;
      continue;
    }
    if (char === '`') {
      state.inBacktick = true;
      continue;
    }

    // Brackets
    if (char === '{' || char === '[' || char === '(') {
      opening++;
    } else if (char === '}' || char === ']' || char === ')') {
      closing++;
    }
    // JSX Tags
    else if (char === '<') {
      if (nextChar === '/') {
        // Closing tag </Tag> or </>
        closing++;
        i++;
      } else if (nextChar === '>') {
        // Fragment opening <>
        opening++;
        i++;
      } else if (/[a-zA-Z_]/.test(nextChar)) {
        // Heuristic to distinguish between tag and comparison
        const prevText = line.substring(0, i).trim();
        const prevChar = prevText[prevText.length - 1] || '';
        const isPrecededByLetterOrDigit = /[a-zA-Z0-9]/.test(prevChar);

        let isKeyword = false;
        if (isPrecededByLetterOrDigit) {
          const beforeMatch = prevText.match(/(return|case|yield|await|default)$/);
          if (beforeMatch) isKeyword = true;
        }

        if (!isPrecededByLetterOrDigit || isKeyword) {
          opening++;
        }
      }
    } else if (char === '/' && nextChar === '>') {
      // Self-closing tag />
      closing++;
      i++;
    }
  }

  return { opening, closing, state };
}
