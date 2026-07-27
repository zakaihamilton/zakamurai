/** Shared safety checks for AI-proposed workspace changes. */
export function validateProjectPath(path) {
  if (typeof path !== 'string' || !path.trim()) return 'A file path is required.';
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Path must be project-relative: ${path}`;
  }
  if (path.includes('\\') || path.split('/').some((part) => part === '..' || !part)) {
    return `Unsafe project path: ${path}`;
  }
  return null;
}

/** Strips single-line and multi-line comments from code strings for bracket matching. */
function stripComments(content) {
  let result = '';
  let inSingleComment = false;
  let inMultiComment = false;
  let inString = null;
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
export function validateContentSyntax(path, content) {
  if (typeof content !== 'string' || !path) return null;

  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    try {
      JSON.parse(content);
    } catch (err) {
      return `Invalid JSON syntax in ${path}: ${err.message}`;
    }
  }

  if (['js', 'jsx', 'ts', 'tsx', 'css'].includes(ext)) {
    const cleanContent = stripComments(content);
    const stack = [];
    let inString = null;
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

      if (char === "'" || char === '"' || char === '`') {
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

/** Async syntax validation with esbuild transform attempt if initialized. */
export async function validateContentSyntaxAsync(path, content, esbuildTransform = null) {
  const syncError = validateContentSyntax(path, content);
  if (syncError) return syncError;

  if (typeof esbuildTransform === 'function') {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      try {
        const loader = ext === 'tsx' ? 'tsx' : ext === 'ts' ? 'ts' : ext === 'jsx' ? 'jsx' : 'js';
        await esbuildTransform(content, { loader });
      } catch (err) {
        return `Syntax error in ${path}: ${err.message || String(err)}`;
      }
    }
  }

  return null;
}

/**
 * Returns structured accepted/rejected operations so callers can preserve the
 * staged review flow while explaining why unsafe proposals were ignored.
 */
export function validateAIChanges(changes) {
  if (!Array.isArray(changes)) return { accepted: [], rejected: ['Changes must be an array.'] };
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      continue;
    }
    if (seen.has(path)) {
      rejected.push(`Conflicting operations target ${path}.`);
      continue;
    }

    const content = change.content ?? change.after;
    if (
      typeof change.content !== 'string' &&
      typeof change.after !== 'string' &&
      change.after !== undefined
    ) {
      rejected.push(`Invalid change content for ${path}.`);
      continue;
    }

    if (typeof content === 'string') {
      const syntaxError = validateContentSyntax(path, content);
      if (syntaxError) {
        rejected.push(syntaxError);
        continue;
      }
    }

    seen.add(path);
    accepted.push(change);
  }
  return { accepted, rejected };
}
