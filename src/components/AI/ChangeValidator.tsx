import type { AgentChange, EsbuildTransform, ValidatedAIChanges } from '@/components/AI/types';
import { hasValidAiChangeContent, isProjectRelativePath } from '@/contracts/ai';

/** Shared safety checks for AI-proposed workspace changes. */
export function validateProjectPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return 'A file path is required.';
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Path must be project-relative: ${path}`;
  }
  if (!isProjectRelativePath(path)) {
    return `Unsafe project path: ${path}`;
  }
  return null;
}

/** Strips single-line and multi-line comments from code strings for bracket matching. */
function stripComments(content: string): string {
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

/**
 * Reject CSS values that are syntactically balanced but cannot resolve at runtime.
 * This also bounds runaway local-model output such as deeply nested var() fallbacks.
 */
export function validateCssContentSafety(path: string, content: string): string | null {
  if (!/\.css$/i.test(path) || typeof content !== 'string') return null;

  const customProperty = /(?:^|[;{])\s*(--[\w-]+)\s*:\s*([^;{}]*)/gm;
  for (const match of content.matchAll(customProperty)) {
    const [, name, value] = match;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\bvar\\(\\s*${escapedName}(?:\\s*[,)]|$)`).test(value)) {
      return `CSS custom property ${name} cannot reference itself in ${path}.`;
    }
  }

  let depth = 0;
  let maxDepth = 0;
  for (const char of stripComments(content)) {
    if (char === '(') maxDepth = Math.max(maxDepth, ++depth);
    else if (char === ')') depth--;
  }
  if (maxDepth > 16) {
    return `CSS function nesting exceeds 16 levels in ${path}. Simplify the declaration.`;
  }

  return null;
}

/**
 * Enforces the generated-project styling contract before a JSX write is staged.
 * CSS custom properties are still expressed in CSS Modules; generated components
 * must not embed CSS in JSX where it cannot be reviewed alongside its stylesheet.
 */
export function validateComponentStyling(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  if (/\bstyle\s*=\s*\{/.test(content) || /<style\b/i.test(content)) {
    return `Inline CSS is not allowed in ${path}. Move styles to a co-located *.module.css file and import it into the component.`;
  }
  return null;
}

/** Ensures generated components use the scoped names exported by CSS Modules. */
export function validateCssModuleUsage(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const cssModuleImport = /\bimport\s+(?:(\w+)\s+from\s+)?["'][^"']+\.module\.css["']/g;
  const matches = [...content.matchAll(cssModuleImport)];
  if (matches.length === 0) return null;
  if (matches.some((match) => !match[1])) {
    return `CSS Modules in ${path} must be default-imported as a class map (for example, import styles from './App.module.css') instead of side-effect imported.`;
  }
  if (/\bclassName\s*=\s*["'][^"']+["']/.test(content)) {
    return `Use the imported CSS Module class map in ${path} (for example, className={styles.container}) instead of literal className strings.`;
  }
  return null;
}

/** Reject a stylesheet that was accidentally assigned a JSX or TSX path. */
export function validateFileContentType(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const source = stripComments(content).trim();
  if (
    /^(?:async\s+)?(?:class|const|enum|export|function|import|interface|let|type|var)\b/.test(
      source,
    )
  ) {
    return null;
  }
  const startsWithCssRule =
    /^(?:@(?:container|font-face|import|keyframes|layer|media|supports)\b|:root\b|[.#*\[]|(?:[a-z][\w-]*)(?:\s*\{|\s*[>+~]\s*|\s+|\s*,\s*[.#:]?)[^{]*\{)/i.test(
      source,
    );

  if (startsWithCssRule) {
    return `CSS content cannot be written to ${path}. Write it to a *.css or *.module.css file instead.`;
  }
  return null;
}

/** Async syntax validation with esbuild transform attempt if initialized. */
export async function validateContentSyntaxAsync(
  path: string,
  content: string,
  esbuildTransform: EsbuildTransform | null = null,
): Promise<string | null> {
  const syncError = validateContentSyntax(path, content);
  if (syncError) return syncError;

  if (typeof esbuildTransform === 'function') {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
      try {
        const loader = ext === 'tsx' ? 'tsx' : ext === 'ts' ? 'ts' : ext === 'jsx' ? 'jsx' : 'js';
        await esbuildTransform(content, { loader });
      } catch (err) {
        const error = err as Error;
        return `Syntax error in ${path}: ${error.message || String(err)}`;
      }
    }
  }

  return null;
}

/**
 * Async validation for structured AI changes including esbuild transform checks.
 */
export async function validateAIChangesAsync(
  changes: AgentChange[],
  esbuildTransform: EsbuildTransform | null = null,
): Promise<ValidatedAIChanges> {
  if (!Array.isArray(changes)) {
    return { accepted: [], rejected: ['Changes must be an array.'], details: [] };
  }
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  const details: NonNullable<ValidatedAIChanges['details']> = [];

  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      details.push({ path: String(path), error: pathError, type: 'path' });
      continue;
    }
    if (seen.has(path as string)) {
      const conflictErr = `Conflicting operations target ${path}.`;
      rejected.push(conflictErr);
      details.push({ path: String(path), error: conflictErr, type: 'conflict' });
      continue;
    }

    const content = change.content ?? change.after;
    if (!hasValidAiChangeContent(change)) {
      const contentErr = `Invalid change content for ${path}.`;
      rejected.push(contentErr);
      details.push({ path: String(path), error: contentErr, type: 'content' });
      continue;
    }

    if (typeof content === 'string') {
      const stylingError = validateComponentStyling(path as string, content);
      if (stylingError) {
        rejected.push(stylingError);
        details.push({
          path: String(path),
          error: stylingError,
          type: 'styling',
          failedContent: content,
        });
        continue;
      }
      const cssModuleError = validateCssModuleUsage(path as string, content);
      if (cssModuleError) {
        rejected.push(cssModuleError);
        details.push({
          path: String(path),
          error: cssModuleError,
          type: 'styling',
          failedContent: content,
        });
        continue;
      }
      const contentTypeError = validateFileContentType(path as string, content);
      if (contentTypeError) {
        rejected.push(contentTypeError);
        details.push({
          path: String(path),
          error: contentTypeError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const cssSafetyError = validateCssContentSafety(path as string, content);
      if (cssSafetyError) {
        rejected.push(cssSafetyError);
        details.push({
          path: String(path),
          error: cssSafetyError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const syntaxError = await validateContentSyntaxAsync(
        path as string,
        content,
        esbuildTransform,
      );
      if (syntaxError) {
        rejected.push(syntaxError);
        details.push({
          path: String(path),
          error: syntaxError,
          type: 'syntax',
          failedContent: content,
        });
        continue;
      }
    }

    seen.add(path as string);
    accepted.push(change);
  }

  return { accepted, rejected, details };
}

/**
 * Returns structured accepted/rejected operations so callers can preserve the
 * staged review flow while explaining why unsafe proposals were ignored.
 */
export function validateAIChanges(changes: AgentChange[]): ValidatedAIChanges {
  if (!Array.isArray(changes)) return { accepted: [], rejected: ['Changes must be an array.'] };
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      continue;
    }
    if (seen.has(path as string)) {
      rejected.push(`Conflicting operations target ${path}.`);
      continue;
    }

    const content = change.content ?? change.after;
    if (!hasValidAiChangeContent(change)) {
      rejected.push(`Invalid change content for ${path}.`);
      continue;
    }

    if (typeof content === 'string') {
      const stylingError = validateComponentStyling(path as string, content);
      if (stylingError) {
        rejected.push(stylingError);
        continue;
      }
      const cssModuleError = validateCssModuleUsage(path as string, content);
      if (cssModuleError) {
        rejected.push(cssModuleError);
        continue;
      }
      const contentTypeError = validateFileContentType(path as string, content);
      if (contentTypeError) {
        rejected.push(contentTypeError);
        continue;
      }
      const cssSafetyError = validateCssContentSafety(path as string, content);
      if (cssSafetyError) {
        rejected.push(cssSafetyError);
        continue;
      }
      const syntaxError = validateContentSyntax(path as string, content);
      if (syntaxError) {
        rejected.push(syntaxError);
        continue;
      }
    }

    seen.add(path as string);
    accepted.push(change);
  }
  return { accepted, rejected };
}

/**
 * Validates component modularity and CSS module co-location across staged files.
 */
export function validateWorkspaceModularity(files: Record<string, string>): {
  passed: boolean;
  errors: string[];
} {
  const { checkComponentModularity } = require('./Agent/ProjectChecks');
  return checkComponentModularity(files);
}
