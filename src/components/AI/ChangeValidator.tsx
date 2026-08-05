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

/** Rejects comment-only scaffolding and non-code prose that claims to be an implementation. */
export function validateGeneratedPlaceholder(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const stripped = stripComments(content).trim();
  if (!stripped) {
    if (
      !/(?:your\s+)?implementation\b|goes\s+here|insert\s+(?:code|implementation)|\bTODO\b/i.test(
        content,
      )
    ) {
      return null;
    }
    return `Generated content for ${path} is only a placeholder. Return a complete working implementation instead.`;
  }

  if (!/\.(?:jsx|tsx)$/i.test(path)) return null;

  // Stylesheet-shaped payloads are handled by validateFileContentType.
  if (
    /^(?:@(?:container|font-face|import|keyframes|layer|media|supports)\b|:root\b|[.#*\[]|(?:[a-z][\w-]*)(?:\s*\{|\s*[>+~]\s*|\s+|\s*,\s*[.#:]?)[^{]*\{)/i.test(
      stripped,
    )
  ) {
    return null;
  }

  const looksLikeSource =
    /^(?:async\s+)?(?:class|const|enum|export|function|import|interface|let|type|var)\b/m.test(
      stripped,
    ) ||
    /\b(?:export\s+default|function\s+[A-Za-z_$]|=>\s*[{(]|return\s*[(<]|use(?:State|Effect|Memo|Callback|Ref)\s*\(|<[A-Za-z][\w.]*)/.test(
      stripped,
    );
  if (!looksLikeSource) {
    return `Generated content for ${path} is not valid source code. Return a complete working implementation instead of prose or a request paraphrase.`;
  }
  return null;
}

const isAppEntryPath = (path: string): boolean =>
  /(?:^|\/)(?:App|main|index)\.(?:jsx|tsx)$/i.test(path);

const clipRequest = (request: string): string => request.trim().replace(/\s+/g, ' ').slice(0, 80);

const isThinComponentShell = (path: string, content: string): boolean =>
  isAppEntryPath(path) &&
  /import\s+[A-Za-z_$][\w$]*\s+from\s+["']\.\/(?:components\/)?[^"']+["']/.test(content) &&
  content.trim().length < 500;

/**
 * Rejects starter-template leftovers and trivial shells for create/build requests.
 * Small local models often rename the placeholder title and finish without a real app.
 */
export function validateRequestFulfillment(
  path: string,
  content: string,
  request: string,
): string | null {
  if (typeof content !== 'string' || typeof request !== 'string') return null;
  if (!/\.(?:jsx|tsx)$/i.test(path)) return null;
  if (!/\b(?:add|build|create|implement|make)\b/i.test(request)) return null;

  const clipped = clipRequest(request);
  if (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content)) {
    return `Generated content for ${path} still looks like the starter template. Implement the full request ("${clipped}") instead of leaving placeholder copy.`;
  }

  if (!isAppEntryPath(path) && !/components\//i.test(path)) return null;

  // Thin App shells that only mount a component are fine; the component must fulfill the request.
  if (isThinComponentShell(path, content)) return null;

  if (
    /\btic[\s-]*tac[\s-]*toe\b/i.test(request) &&
    /<h[1-3][^>]*>\s*tic[\s-]*tac[\s-]*toe\s*<\/h[1-3]>/i.test(content) &&
    !/<button\b/i.test(content) &&
    !/\bon(?:Click|KeyDown)\b/.test(content)
  ) {
    return `Generated content for ${path} only renders a Tic-Tac-Toe heading. Render a visible 3x3 board with nine playable cells, turn/status text, and a reset control before finishing.`;
  }

  if (content.trim().length < 400) {
    return `Generated content for ${path} is too short to fulfill "${clipped}". Return a complete implementation instead of a stub.`;
  }

  const looksInteractive =
    /<(?:button|input|select|textarea)\b/i.test(content) ||
    /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  if (!looksInteractive) return null;

  const hasState = /\buse(?:State|Reducer)\b/.test(content);
  const hasInteraction = /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  if (!hasState || !hasInteraction) {
    return `Generated content for ${path} does not look like a working implementation of "${clipped}". Include React state (useState/useReducer) and event handlers so the UI is interactive.`;
  }

  return null;
}

/** True when staged JSX fulfills a create/build request (including required CSS Modules). */
export function workspaceFulfillsInteractiveRequest(
  files: Record<string, string>,
  request: string,
): string | null {
  if (typeof request !== 'string') return null;
  if (!/\b(?:add|build|create|implement|make)\b/i.test(request)) return null;

  const jsxFiles = Object.entries(files).filter(([path]) => /\.(?:jsx|tsx)$/i.test(path));
  for (const [path, content] of jsxFiles) {
    if (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content)) {
      return `Generated content for ${path} still looks like the starter template. Implement the full request ("${clipRequest(request)}") instead of leaving placeholder copy.`;
    }
  }

  const implementors = jsxFiles.filter(([path, content]) => !isThinComponentShell(path, content));
  if (!implementors.length) {
    return `Staged files do not fulfill "${clipRequest(request)}". Return a complete implementation before finishing.`;
  }

  for (const [path, content] of implementors) {
    if (validateRequestFulfillment(path, content, request)) continue;
    const needsStyles =
      /<(?:button|input|select|textarea)\b/i.test(content) ||
      /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
    if (needsStyles) {
      const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
      if (!/\.module\.css/.test(content) || !Object.hasOwn(files, stylesheetPath)) {
        return `Generated content for ${path} is missing a co-located CSS Module (${stylesheetPath}). Import styles from that module and include layout rules for the UI.`;
      }
    }
    return null;
  }

  return validateRequestFulfillment(implementors[0][0], implementors[0][1], request);
}

/** Keeps small generated apps on local state instead of adding unrequested state libraries. */
export function validateForbiddenStateLibraryUsage(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const forbiddenPackage = /^(?:@reduxjs\/toolkit|redux|recoil|zustand)(?:\/|$)/i;
  const isPackageManifest = /(?:^|\/)package\.json$/i.test(path);
  const usesForbiddenPackage = isPackageManifest
    ? /["'](?:@reduxjs\/toolkit|redux|recoil|zustand)["']\s*:/i.test(content)
    : /(?:from\s*|require\(\s*|import\s*\(\s*)["'][^"']+["']/i.test(content) &&
      [...content.matchAll(/(?:from\s*|require\(\s*|import\s*\(\s*)["']([^"']+)["']/gi)].some(
        (match) => forbiddenPackage.test(match[1]),
      );
  return usesForbiddenPackage
    ? `Do not introduce Redux, Zustand, Recoil, or another unrequested state library in ${path}. Use React local state or plain browser state instead.`
    : null;
}

/** Ensures generated components use the scoped names exported by CSS Modules. */
export function validateCssModuleUsage(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const cssModuleImport = /\bimport\s+(?:(\w+)\s+from\s+)?["'][^"']+\.module\.css["']/g;
  const matches = [...content.matchAll(cssModuleImport)];
  if (matches.length === 0) return null;
  if (matches.some((match) => !match[1])) {
    return `CSS Modules in ${path} must be default-imported as a class map (for example, use a styles binding from the co-located module) instead of side-effect imported.`;
  }
  if (
    matches.some((match) => match[1] === 'styles') &&
    /\b(?:const|let|var|function|class)\s+styles\b/.test(content)
  ) {
    return `The CSS Module binding styles is declared more than once in ${path}. Keep the imported styles class map and remove or rename the duplicate declaration.`;
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
  const containsEmbeddedCss =
    /(?:[.#][A-Za-z_-][\w-]*|:root|@(?:media|supports|keyframes|layer))\s*\{/i.test(source) ||
    /--[\w-]+\s*:/m.test(source) ||
    /(?:^|\n)\s*(?!import\b|export\b|const\b|let\b|var\b|function\b|return\b|if\b|for\b|while\b|switch\b|class\b)[a-z][\w-]*\s*\{\s*[-\w]+\s*:/im.test(
      source,
    );
  if (containsEmbeddedCss) {
    return `CSS content cannot be written to ${path}. Write it to a *.css or *.module.css file instead.`;
  }
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
      const placeholderError = validateGeneratedPlaceholder(path as string, content);
      if (placeholderError) {
        rejected.push(placeholderError);
        details.push({
          path: String(path),
          error: placeholderError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const stateLibraryError = validateForbiddenStateLibraryUsage(path as string, content);
      if (stateLibraryError) {
        rejected.push(stateLibraryError);
        details.push({
          path: String(path),
          error: stateLibraryError,
          type: 'architecture',
          failedContent: content,
        });
        continue;
      }
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
      const placeholderError = validateGeneratedPlaceholder(path as string, content);
      if (placeholderError) {
        rejected.push(placeholderError);
        continue;
      }
      const stateLibraryError = validateForbiddenStateLibraryUsage(path as string, content);
      if (stateLibraryError) {
        rejected.push(stateLibraryError);
        continue;
      }
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
