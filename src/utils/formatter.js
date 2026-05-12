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
    } catch (e) {
      // If JSON is invalid, return as is (or could try to fix common issues)
      return code;
    }
  }

  if (ext === 'css' || ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'jss') {
    return indentCode(code);
  }

  return code;
}

/**
 * A basic indentation-based formatter that tracks brackets and braces.
 * Handles strings and simple comments to avoid false matches.
 */
function indentCode(code) {
  const lines = code.split('\n');
  let indentLevel = 0;
  let inBlockComment = false;
  
  const formatted = lines.map(line => {
    let trimmed = line.trim();
    if (!trimmed) return '';

    // Handle block comments start/end
    if (trimmed.startsWith('/*')) inBlockComment = true;
    
    // Decrease indent BEFORE the line if it starts with a closing bracket or closing tag
    let decreaseThisLine = 0;
    if (!inBlockComment) {
      // Count closing brackets at the start of the line
      const startsWithClosingBracket = trimmed.match(/^([\}\]\)])+/);
      if (startsWithClosingBracket) {
        decreaseThisLine += startsWithClosingBracket[0].length;
      }
      // Check if line starts with a JSX closing tag
      if (trimmed.startsWith('</')) {
        decreaseThisLine += 1;
      }
    }

    const currentIndent = Math.max(0, indentLevel - decreaseThisLine);
    const newLine = '  '.repeat(currentIndent) + trimmed;

    // Update indentLevel for the NEXT line
    if (!inBlockComment) {
      const { opening, closing } = analyzeLine(trimmed);
      indentLevel += (opening - closing);
    }

    if (trimmed.endsWith('*/')) inBlockComment = false;
    
    return newLine;
  });

  return formatted.join('\n');
}

/**
 * Analyzes a line to determine how much the indentation should change for subsequent lines.
 * Tracks brackets, braces, and JSX tags.
 */
function analyzeLine(line) {
  let opening = 0;
  let closing = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let escaped = false;

  // Simple line comment check - ignore everything after //
  const lineCommentIdx = line.indexOf('//');
  const cleanLine = lineCommentIdx !== -1 ? line.substring(0, lineCommentIdx) : line;

  for (let i = 0; i < cleanLine.length; i++) {
    const char = cleanLine[i];
    const nextChar = cleanLine[i + 1];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote && !inBacktick) inSingleQuote = !inSingleQuote;
    else if (char === '"' && !inSingleQuote && !inBacktick) inDoubleQuote = !inDoubleQuote;
    else if (char === '`' && !inSingleQuote && !inDoubleQuote) inBacktick = !inBacktick;

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      // Brackets
      if (char === '{' || char === '[' || char === '(') opening++;
      else if (char === '}' || char === ']' || char === ')') closing++;
      
      // JSX Tags
      else if (char === '<') {
        if (nextChar === '/') {
          // Closing tag </Tag>
          closing++;
          i++; // Skip the /
        } else if (/[a-zA-Z_]/.test(nextChar)) {
          // Opening tag <Tag
          opening++;
        }
      } else if (char === '/' && nextChar === '>') {
        // Self-closing tag />
        closing++;
        i++; // Skip the >
      }
    }
  }

  return { opening, closing };
}
