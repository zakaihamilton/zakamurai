/** Strips single-line and multi-line comments from code strings for bracket matching. */
export function stripComments(content: string): string {
  let result = '';
  let inSingleComment = false;
  let inMultiComment = false;
  let inString: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (isEscaped) {
      isEscaped = false;
      if (!inSingleComment && !inMultiComment) result += char;
      continue;
    }

    if (char === '\\' && inString) {
      isEscaped = true;
      if (!inSingleComment && !inMultiComment) result += char;
      continue;
    }

    if (inSingleComment) {
      if (char === '\n' || char === '\r') {
        inSingleComment = false;
        result += char;
      }
      continue;
    }

    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleComment = true;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i++;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      result += char;
      continue;
    }

    result += char;
  }

  return result;
}

/** Checks basic syntax validity (balanced brackets, valid JSON, unterminated strings) for proposals. */
export function validateContentSyntax(path: string, content: string): string | null {
  if (typeof content !== 'string' || !path) return null;

  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    try {
      JSON.parse(content);
    } catch (err) {
      const error = err as Error;
      return `Invalid JSON syntax in ${path}: ${error.message}`;
    }
  }

  if (['js', 'jsx', 'ts', 'tsx', 'css'].includes(ext || '')) {
    const cleanContent = stripComments(content);
    const stack: Array<{ char: string; index: number }> = [];
    let inString: string | null = null;
    let isEscaped = false;

    for (let i = 0; i < cleanContent.length; i++) {
      const char = cleanContent[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (inString) {
        if (char === inString) {
          inString = null;
        }
        continue;
      }

      // Apostrophes in JSX text (for example, <h1>Let's play</h1>) are not
      // JavaScript string delimiters. This lightweight parser cannot fully parse JSX,
      // so only treat a single quote as a string opener in an expression position.
      const previousNonWhitespace = cleanContent.slice(0, i).trimEnd().at(-1) || '';
      const isSingleQuoteStringStart =
        char === "'" && (!previousNonWhitespace || /[=([{,:;?!]/.test(previousNonWhitespace));
      if (isSingleQuoteStringStart || char === '"' || char === '`') {
        inString = char;
        continue;
      }

      if (char === '{' || char === '(' || char === '[') {
        stack.push({ char, index: i });
      } else if (char === '}' || char === ')' || char === ']') {
        const last = stack.pop();
        const expected = char === '}' ? '{' : char === ')' ? '(' : '[';
        if (!last || last.char !== expected) {
          return `Unmatched bracket '${char}' in ${path}`;
        }
      }
    }

    if (inString) {
      return `Unterminated string literal (${inString}) in ${path}`;
    }
    if (stack.length > 0) {
      return `Unclosed '${stack[stack.length - 1].char}' in ${path}`;
    }
  }

  return null;
}
