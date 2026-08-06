import type { AgentAction } from '@/components/AI/types';

const MAX_REASONING_RESULT_CHARS = 3000;

const truncateReasoningResult = (value: string): string =>
  value.length > MAX_REASONING_RESULT_CHARS
    ? `${value.slice(0, MAX_REASONING_RESULT_CHARS)}\n…[tool result truncated in reasoning log]`
    : value;

export const observation = (action: string, ok: boolean, data: unknown): string =>
  JSON.stringify({ tool: action, ok, ...(ok ? { result: data } : { error: data }) });

export const formatReasoningResult = (action: AgentAction, result: unknown): string => {
  const text = String(result ?? '');
  const lines = text ? text.split('\n').filter(Boolean) : [];

  if (action.action === 'list_files') {
    const scope = action.query ? ` matching “${action.query}”` : '';
    return truncateReasoningResult(
      lines.length ? `Found ${lines.length} file(s)${scope}:\n${text}` : `No files found${scope}.`,
    );
  }
  if (action.action === 'read_file') {
    if (text.startsWith('File not found:')) return text;
    return `Read ${action.path} (${text.length.toLocaleString()} characters).`;
  }
  if (action.action === 'search_workspace' || action.action === 'search_semantic') {
    return truncateReasoningResult(
      `${lines.length} search result line(s) for “${action.query || ''}”:\n${text}`,
    );
  }
  return truncateReasoningResult(text);
};

export const isFailedValidationResult = (result: string): boolean => {
  try {
    return (JSON.parse(result) as { status?: string }).status === 'failed';
  } catch {
    return /\bfailed\b/i.test(result);
  }
};

export const READ_ONLY_ACTIONS = new Set([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'list_project_checks',
  'inspect_preview',
  'inspect_console_logs',
  'get_file_symbols',
  'manage_packages',
]);

export const NON_PRODUCTIVE_ACTIONS = new Set([
  ...READ_ONLY_ACTIONS,
  'validate',
  'run_project_check',
]);

export function applySearchReplaceBlock(existing: string, search: string, replace: string): string {
  if (existing.includes(search)) {
    return existing.replace(search, replace);
  }

  const existingLines = existing.split('\n');
  const searchLines = search.trim().split('\n');

  if (searchLines.length > 0) {
    for (let i = 0; i <= existingLines.length - searchLines.length; i++) {
      let match = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (existingLines[i + j].trim() !== searchLines[j].trim()) {
          match = false;
          break;
        }
      }
      if (match) {
        const before = existingLines.slice(0, i);
        const after = existingLines.slice(i + searchLines.length);
        const replacementLines = replace.split('\n');
        return [...before, ...replacementLines, ...after].join('\n');
      }
    }
  }

  throw new Error('Target search block not found in file content.');
}

export const resolveRelativePath = (fromPath: string, specifier: string): string => {
  const parts = fromPath.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};

export const missingCssModuleImports = (
  path: string,
  content: string,
  files: Record<string, string>,
): string[] => {
  const matches = content.matchAll(
    /\bimport(?:[\s\S]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+\.module\.css)["']/g,
  );
  return [...new Set([...matches].map((match) => resolveRelativePath(path, match[1])))].filter(
    (stylesheetPath) => !Object.hasOwn(files, stylesheetPath),
  );
};

export const normalizeSideEffectCssSource = (
  path: string,
  content: string,
): { content: string; stylesheets: string[] } | null => {
  const imports = [...content.matchAll(/\bimport\s+(["'])(\.{1,2}\/[^"']+\.css)\1\s*;?/g)];
  const stylesImportCount = [
    ...content.matchAll(/\bimport\s+styles\s+from\s+(["'])(\.{1,2}\/[^"']+\.module\.css)\1\s*;?/g),
  ].length;
  if (!imports.length && stylesImportCount < 2) return null;

  const stylesheets = new Set<string>();
  const existingModuleImports = new Set(
    [
      ...content.matchAll(
        /\bimport\s+styles\s+from\s+(?:["'])(\.{1,2}\/[^"']+\.module\.css)(?:["'])/g,
      ),
    ].map((match) => match[1]),
  );
  let normalized = content.replace(
    /\bimport\s+(["'])(\.{1,2}\/[^"']+\.css)\1\s*;?/g,
    (_match, quote: string, specifier: string) => {
      const moduleSpecifier = specifier.endsWith('.module.css')
        ? specifier
        : specifier.replace(/\.css$/i, '.module.css');
      stylesheets.add(resolveRelativePath(path, moduleSpecifier));
      if (existingModuleImports.has(moduleSpecifier)) return '';
      existingModuleImports.add(moduleSpecifier);
      return `import styles from ${quote}${moduleSpecifier}${quote};`;
    },
  );

  const seenStylesImports = new Set<string>();
  let keptStylesBinding = false;
  normalized = normalized.replace(
    /\bimport\s+styles\s+from\s+(["'])(\.{1,2}\/[^"']+\.module\.css)\1\s*;?/g,
    (match, _quote: string, specifier: string) => {
      if (seenStylesImports.has(specifier) || keptStylesBinding) return '';
      seenStylesImports.add(specifier);
      keptStylesBinding = true;
      return match;
    },
  );

  normalized = normalized.replace(
    /className\s*=\s*(["'])([^"']+)\1/g,
    (_match, _quote: string, classValue: string) => {
      const classes = classValue.trim().split(/\s+/).filter(Boolean);
      if (!classes.length) return 'className={undefined}';
      const references = classes.map((className) =>
        /^[A-Za-z_$][\w$]*$/.test(className)
          ? `styles.${className}`
          : `styles[${JSON.stringify(className)}]`,
      );
      if (references.length === 1) return `className={${references[0]}}`;
      return `className={${references.join(" + ' ' + ")}}`;
    },
  );

  return { content: normalized, stylesheets: [...stylesheets] };
};

const CSS_MODULE_RECOVERY_RULES: Record<string, string> = {
  app: 'min-height: 100vh; width: min(100%, 54rem); margin: 0 auto; padding: clamp(1.25rem, 5vw, 3.5rem); color: #292521; background: #fffdf8;',
  container:
    'width: min(100%, 42rem); margin: 0 auto; padding: 2rem; border-radius: 1.5rem; color: #292521; background: #fffdf8; border: 1px solid #e3d9cc; box-shadow: 0 24px 60px rgb(65 48 36 / 12%);',
  header: 'display: grid; gap: 0.75rem; margin-bottom: 1.5rem; text-align: center;',
  title: 'margin: 0; font-size: clamp(2rem, 8vw, 3.75rem); letter-spacing: -0.06em;',
  scores: 'display: flex; justify-content: center; gap: 0.75rem;',
  scoreItem:
    'padding: 0.45rem 0.75rem; border-radius: 999px; background: rgb(255 255 255 / 12%); font-weight: 700;',
  gameArea: 'display: grid; gap: 1.25rem;',
  board: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem;',
  grid: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem;',
  square:
    'aspect-ratio: 1; font-size: clamp(2rem, 11vw, 4.75rem); font-weight: 800; color: #f8fafc; background: #1e3a8a; border: 1px solid rgb(255 255 255 / 22%); border-radius: 1rem; cursor: pointer;',
  cell: 'aspect-ratio: 1; font-size: clamp(2rem, 11vw, 4.75rem); font-weight: 800; color: #f8fafc; background: #1e3a8a; border: 1px solid rgb(255 255 255 / 22%); border-radius: 1rem; cursor: pointer;',
  x: 'color: #67e8f9;',
  o: 'color: #f472b6;',
  status:
    'justify-self: center; padding: 0.55rem 0.8rem; border-radius: 999px; background: rgb(255 255 255 / 12%); font-weight: 700;',
  result: 'display: grid; min-height: 18rem; place-content: center; gap: 1rem; text-align: center;',
  resultText: 'margin: 0; color: #fef08a; font-size: clamp(1.5rem, 6vw, 2.5rem); font-weight: 800;',
  winnerText: 'margin: 0; color: #fef08a; font-size: clamp(2rem, 9vw, 4rem);',
  resetBtn:
    'justify-self: center; padding: 0.7rem 1rem; color: #0f172a; font: inherit; font-weight: 800; background: #67e8f9; border: 0; border-radius: 0.75rem; cursor: pointer;',
  newGameBtn:
    'padding: 0.7rem 1rem; color: #0f172a; font: inherit; font-weight: 800; background: #67e8f9; border: 0; border-radius: 0.75rem; cursor: pointer;',
  footer: 'margin-top: 1.5rem; color: #94a3b8; text-align: center;',
  button:
    'min-height: 2.75rem; padding: 0.7rem 1rem; color: #fffaf5; font: inherit; font-weight: 700; background: #292521; border: 1px solid #292521; border-radius: 0.75rem; cursor: pointer; transition: background 160ms ease, transform 160ms ease;',
  control:
    'flex: 1 1 18rem; min-width: 0; min-height: 2.75rem; padding: 0.7rem 0.8rem; color: #292521; font: inherit; background: #fffaf5; border: 1px solid #d8cec2; border-radius: 0.75rem;',
  list: 'display: grid; gap: 0.75rem;',
};

const CSS_MODULE_RECOVERY_BASE = `:global(:root) {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f8fafc;
  color: #0f172a;
}

:global(*), :global(*::before), :global(*::after) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
}

:global(#root) {
  min-height: 100vh;
}

:global(button), :global(input), :global(select), :global(textarea) {
  font: inherit;
}

:global(button) {
  cursor: pointer;
}

:global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) {
  outline: 3px solid #0ea5e9;
  outline-offset: 2px;
}

:global(input::placeholder), :global(textarea::placeholder) {
  color: #64748b;
}
`;

const CSS_MODULE_INTERACTIVE_BASE = `:global(button) {
  min-height: 2.75rem;
  padding: 0.65rem 0.9rem;
  color: #fffaf5;
  font: inherit;
  font-weight: 700;
  background: #292521;
  border: 1px solid #292521;
  border-radius: 0.7rem;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

:global(input), :global(select), :global(textarea) {
  min-height: 2.75rem;
  padding: 0.65rem 0.75rem;
  color: #292521;
  font: inherit;
  background: #fffaf5;
  border: 1px solid #d8cec2;
  border-radius: 0.7rem;
}

:global(button:hover) {
  background: #b85c45;
  border-color: #b85c45;
  transform: translateY(-1px);
}

:global(button:active) {
  transform: translateY(0);
}
`;

const hasInteractiveElements = (content: string): boolean =>
  /<(?:button|input|select|textarea)\b/i.test(content);

const hasInteractiveBase = (content: string): boolean =>
  /:global\(button\)\s*\{[\s\S]*?background\s*:/.test(content) &&
  /:global\(input\)\s*,\s*:global\(select\)\s*,\s*:global\(textarea\)\s*\{[\s\S]*?background\s*:/.test(
    content,
  );

const cssModuleClassNames = (content: string): Set<string> =>
  new Set(
    [
      ...content.matchAll(/\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g),
    ].map((match) => match[1] || match[2]),
  );

const definedCssModuleClassNames = (content: string): Set<string> =>
  new Set([...content.matchAll(/\.([A-Za-z_-][\w-]*)\s*\{/g)].map((match) => match[1]));

const recoveryRuleForClassName = (className: string): string => {
  if (CSS_MODULE_RECOVERY_RULES[className]) return CSS_MODULE_RECOVERY_RULES[className];
  const normalized = className.toLowerCase();
  if (/(?:app|root|page|screen|shell|layout|wrapper|container|card|panel)/.test(normalized)) {
    return 'display: grid; gap: 1.25rem; width: min(100%, 52rem); margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem); color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1.25rem; box-shadow: 0 18px 45px rgb(15 23 42 / 10%);';
  }
  if (/(?:list|grid|items|content|body|section|stack|columns)/.test(normalized)) {
    return 'display: grid; gap: 0.85rem;';
  }
  if (/(?:title|heading|header|label|status|message|text|caption)/.test(normalized)) {
    return 'color: #0f172a;';
  }
  if (/(?:form|field|group|row|toolbar|actions)/.test(normalized)) {
    return 'display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;';
  }
  if (/(?:item|entry|option|row)/.test(normalized)) {
    return 'padding: 0.8rem 0.9rem; color: #0f172a; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.7rem;';
  }
  if (/(?:button|btn|control|input|select|textarea|action)/.test(normalized)) {
    return 'min-height: 2.75rem; padding: 0.65rem 0.9rem; color: #0f172a; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.7rem;';
  }
  if (/(?:muted|hint|meta|footer|secondary)/.test(normalized)) {
    return 'color: #475569;';
  }
  return 'display: block; box-sizing: border-box; color: #0f172a;';
};

const LEGACY_RECOVERY_SIGNATURE =
  /#0f172a[\s\S]*#172554|#172554[\s\S]*#1e3a8a|#0f172a[\s\S]*#1e3a8a/i;

/** Migrate only the manager's recognizable fallback palette, not user-authored themes. */
const normalizeLegacyRecoveryStylesheet = (content: string): string => {
  if (!LEGACY_RECOVERY_SIGNATURE.test(content)) return content;

  let normalized = content;
  for (const className of ['app', 'container', 'button', 'control']) {
    const body = recoveryRuleForClassName(className);
    normalized = normalized.replace(
      new RegExp(`\\.${className}\\s*\\{[^}]*\\}`, 'g'),
      `.${className} {\n  ${body}\n}`,
    );
  }
  return normalized;
};

const formatCssModuleRules = (classNames: Iterable<string>, includeBase = true): string => {
  const selectedRules = [...classNames].map(
    (className) => `.${className} {\n  ${recoveryRuleForClassName(className)}\n}`,
  );
  const rules = selectedRules.join('\n\n') || '.component {\n  display: block;\n}\n';
  return includeBase
    ? `${CSS_MODULE_RECOVERY_BASE}\n${CSS_MODULE_INTERACTIVE_BASE}\n${rules}`
    : rules;
};

export const cssModuleRecovery = (content: string): string =>
  formatCssModuleRules(cssModuleClassNames(content));

/**
 * When a JSX/TSX write imports an existing CSS Module that does not define the
 * `styles.*` classes the component uses, return those stylesheet paths.
 * (missingCssModuleImports only covers entirely absent files.)
 */
export const incompleteCssModuleImports = (
  path: string,
  content: string,
  files: Record<string, string>,
): string[] => {
  if (!/\.(jsx|tsx)$/i.test(path)) return [];
  const required = cssModuleClassNames(content);
  if (!required.size) return [];

  return [
    ...new Set(
      [
        ...content.matchAll(
          /\bimport(?:[\s\S]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+\.module\.css)["']/g,
        ),
      ].map((match) => resolveRelativePath(path, match[1])),
    ),
  ].filter((stylesheetPath) => {
    if (!Object.hasOwn(files, stylesheetPath)) return false;
    const normalized = normalizeLegacyRecoveryStylesheet(files[stylesheetPath]);
    const defined = definedCssModuleClassNames(normalized);
    return (
      [...required].some((className) => !defined.has(className)) ||
      (hasInteractiveElements(content) && !hasInteractiveBase(normalized)) ||
      LEGACY_RECOVERY_SIGNATURE.test(files[stylesheetPath])
    );
  });
};

/** Append recovered rules for classes referenced by source but missing from an existing stylesheet. */
export const appendMissingCssModuleRules = (
  existingCss: string,
  sourceContent: string,
): string | null => {
  const required = cssModuleClassNames(sourceContent);
  const normalizedExistingCss = normalizeLegacyRecoveryStylesheet(existingCss);
  const defined = definedCssModuleClassNames(normalizedExistingCss);
  const missing = [...required].filter((className) => !defined.has(className));
  const needsInteractiveBase =
    hasInteractiveElements(sourceContent) && !hasInteractiveBase(normalizedExistingCss);
  if (!missing.length && !needsInteractiveBase) return null;

  const additions = [
    ...(needsInteractiveBase ? [CSS_MODULE_INTERACTIVE_BASE.trim()] : []),
    ...(missing.length ? [formatCssModuleRules(missing, false)] : []),
  ];
  // Components often put a 3x3 board directly under `.container`. If cell/square
  // styles were missing, reinforce layout without deleting the existing rule.
  if (
    defined.has('container') &&
    missing.some((className) => className === 'cell' || className === 'square')
  ) {
    additions.unshift(
      '.container {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 0.65rem;\n  width: min(100%, 22rem);\n  align-content: center;\n  justify-items: stretch;\n}',
    );
  }

  return `${normalizedExistingCss.trimEnd()}\n\n${additions.join('\n\n').trim()}\n`;
};

/**
 * Recover missing or incomplete CSS Modules for every JSX/TSX file in the workspace.
 * Used on auto-finish paths where the model validated/looped without writing stylesheets.
 */
export const recoverWorkspaceCssModules = (
  files: Record<string, string>,
): Array<{ path: string; content: string }> => {
  const next = { ...files };
  const updated = new Set<string>();

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx|tsx)$/i.test(path)) continue;
    for (const stylesheet of missingCssModuleImports(path, content, next)) {
      next[stylesheet] = `${cssModuleRecovery(content).trimEnd()}\n`;
      updated.add(stylesheet);
    }
  }

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx|tsx)$/i.test(path)) continue;
    for (const stylesheet of incompleteCssModuleImports(path, content, next)) {
      const merged = appendMissingCssModuleRules(next[stylesheet] || '', content);
      if (!merged) continue;
      next[stylesheet] = merged;
      updated.add(stylesheet);
    }
  }

  return [...updated].map((path) => ({ path, content: next[path] }));
};

export const cssModuleImporters = (
  stylesheetPath: string,
  files: Record<string, string>,
): string[] =>
  Object.entries(files).flatMap(([path, content]) => {
    if (!/\.(?:jsx|tsx)$/i.test(path)) return [];
    const importsStylesheet = [
      ...content.matchAll(/\bimport(?:[\s\S]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+\.module\.css)["']/g),
    ].some((match) => resolveRelativePath(path, match[1]) === stylesheetPath);
    return importsStylesheet ? [path] : [];
  });

export const missingCssModuleRules = (
  stylesheetPath: string,
  content: string,
  files: Record<string, string>,
): string[] => {
  if (!/\.module\.css$/i.test(stylesheetPath)) return [];
  const required = new Set(
    cssModuleImporters(stylesheetPath, files).flatMap((importer) => [
      ...cssModuleClassNames(files[importer]),
    ]),
  );
  const defined = definedCssModuleClassNames(content);
  return [...required].filter((className) => !defined.has(className));
};

/** Complete a stylesheet rewrite with any classes used by its current importers. */
export const repairCssModuleStylesheet = (
  stylesheetPath: string,
  content: string,
  files: Record<string, string>,
): string => {
  let repaired = content;
  for (const importer of cssModuleImporters(stylesheetPath, files)) {
    const merged = appendMissingCssModuleRules(repaired, files[importer] || '');
    if (merged) repaired = merged;
  }
  return repaired;
};

const UNITLESS_STYLE_NUMBERS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageSlice',
  'columnCount',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
]);

const extractBalancedBraces = (text: string, openIndex: number): string | null => {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let escaped = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  return null;
};

const camelToKebab = (name: string): string =>
  name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const jsLiteralToCssValue = (prop: string, raw: string): string | null => {
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const value = Number(trimmed);
    if (UNITLESS_STYLE_NUMBERS.has(prop)) return String(value);
    return `${value}px`;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return null;
};

const parseSimpleStyleObject = (objectBody: string): Record<string, string> | null => {
  const rules: Record<string, string> = {};
  let index = 0;
  const length = objectBody.length;
  const skipWs = () => {
    while (index < length && /\s/.test(objectBody[index])) index += 1;
  };

  while (index < length) {
    skipWs();
    if (index >= length) break;
    if (objectBody[index] === ',') {
      index += 1;
      continue;
    }
    const propMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(objectBody.slice(index));
    if (!propMatch) return null;
    const prop = propMatch[1];
    index += propMatch[0].length;
    skipWs();
    if (index >= length) return null;

    let rawValue = '';
    const start = objectBody[index];
    if (start === '"' || start === "'") {
      let cursor = index + 1;
      let escaped = false;
      while (cursor < length) {
        const char = objectBody[cursor];
        if (escaped) {
          escaped = false;
          cursor += 1;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          cursor += 1;
          continue;
        }
        if (char === start) break;
        cursor += 1;
      }
      if (cursor >= length) return null;
      rawValue = objectBody.slice(index, cursor + 1);
      index = cursor + 1;
    } else {
      const valueMatch = /^-?\d+(\.\d+)?/.exec(objectBody.slice(index));
      if (!valueMatch) return null;
      rawValue = valueMatch[0];
      index += valueMatch[0].length;
    }

    const cssValue = jsLiteralToCssValue(prop, rawValue);
    if (!cssValue) return null;
    rules[camelToKebab(prop)] = cssValue;
    skipWs();
    if (index < length && objectBody[index] === ',') index += 1;
  }

  if (!Object.keys(rules).length) return null;
  return rules;
};

/**
 * Convert React inline `style={{...}}` / `<style>` payloads into a co-located CSS Module
 * so small local models can still stage valid UI source.
 */
export const rewriteInlineStylesToCssModule = (
  path: string,
  content: string,
): { content: string; stylesheetPath: string; stylesheet: string } | null => {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  if (!/\bstyle\s*=\s*\{/.test(content) && !/<style\b/i.test(content)) return null;

  const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
  const importSpecifier = `./${stylesheetPath.split('/').pop()}`;
  const classRules: string[] = [];
  const globalBlocks: string[] = [];
  let rewritten = content;
  let classIndex = 0;

  rewritten = rewritten.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
    const css = block
      .replace(/^<style\b[^>]*>/i, '')
      .replace(/<\/style>$/i, '')
      .trim();
    if (css) globalBlocks.push(css);
    return '';
  });

  const styleAttr = /\bstyle\s*=\s*\{/g;
  const replacements: Array<{ start: number; end: number; className: string }> = [];
  let match = styleAttr.exec(rewritten);
  while (match !== null) {
    const openIndex = match.index + match[0].length - 1;
    const expression = extractBalancedBraces(rewritten, openIndex);
    if (!expression) return null;
    let objectText = expression.trim();
    if (objectText.startsWith('{') && objectText.endsWith('}')) {
      objectText = objectText.slice(1, -1).trim();
    }
    if (!(objectText.startsWith('{') && objectText.endsWith('}'))) return null;
    objectText = objectText.slice(1, -1).trim();
    const rules = parseSimpleStyleObject(objectText);
    const className = `inline${classIndex++}`;
    classRules.push(
      rules
        ? `.${className} {\n${Object.entries(rules)
            .map(([prop, value]) => `  ${prop}: ${value};`)
            .join('\n')}\n}`
        : `.${className} {\n  display: block;\n  box-sizing: border-box;\n}`,
    );
    replacements.push({
      start: match.index,
      end: openIndex + expression.length,
      className,
    });
    match = styleAttr.exec(rewritten);
  }

  for (const replacement of [...replacements].reverse()) {
    rewritten = `${rewritten.slice(0, replacement.start)}className={styles.${replacement.className}}${rewritten.slice(replacement.end)}`;
  }

  if (/\bstyle\s*=\s*\{/.test(rewritten) || /<style\b/i.test(rewritten)) return null;

  if (!/\bimport\s+\w+\s+from\s+['"][^'"]+\.module\.css['"]/.test(rewritten)) {
    const importLine = `import styles from ${JSON.stringify(importSpecifier)};\n`;
    if (/^(\s*import\b[\s\S]*?;\s*\n)+/.test(rewritten)) {
      rewritten = rewritten.replace(/^((?:\s*import\b[\s\S]*?;\s*\n)+)/, `$1${importLine}`);
    } else {
      rewritten = `${importLine}${rewritten}`;
    }
  }

  const stylesheet = [...classRules, ...globalBlocks].join('\n\n').trim();
  if (!stylesheet && !classRules.length) return null;
  return {
    content: rewritten,
    stylesheetPath,
    stylesheet: stylesheet ? `${stylesheet}\n` : '.component {\n  display: block;\n}\n',
  };
};

const insertCssModuleImport = (content: string, importSpecifier: string): string => {
  const importLine = `import styles from ${JSON.stringify(importSpecifier)};\n`;
  if (/\bimport\s+\w+\s+from\s+['"][^'"]+\.module\.css['"]/.test(content)) return content;
  if (/^(\s*import\b[\s\S]*?;\s*\n)+/.test(content)) {
    return content.replace(/^((?:\s*import\b[\s\S]*?;\s*\n)+)/, `$1${importLine}`);
  }
  return `${importLine}${content}`;
};

const annotateInteractiveClassNames = (content: string): string => {
  let rewritten = content;
  rewritten = rewritten.replace(
    /(return\s*(?:\(\s*)?)<(main|div|section|article|form)(?![^>]*\bclassName\s*=)/,
    '$1<$2 className={styles.app}',
  );
  rewritten = rewritten.replace(
    /<h1(?![^>]*\bclassName\s*=)(\s|>)/g,
    '<h1 className={styles.title}$1',
  );
  rewritten = rewritten.replace(
    /<button(?![^>]*\bclassName\s*=)(\s|>)/gi,
    '<button className={styles.button}$1',
  );
  rewritten = rewritten.replace(
    /<(input|select|textarea)(?![^>]*\bclassName\s*=)(\s|>)/gi,
    '<$1 className={styles.control}$2',
  );
  if (
    (/styles\.button/.test(rewritten) || /styles\.control/.test(rewritten)) &&
    /\.map\s*\(/.test(rewritten)
  ) {
    rewritten = rewritten.replace(
      /<(div|ul|ol)(?![^>]*\bclassName\s*=)((?:[^>=]|=\{[^}]*\}|=[^>\s]+|\s)*)>(\s*\{[\s\S]{0,240}?\.map\s*\()/m,
      '<$1 className={styles.list}$2>$3',
    );
  }
  return rewritten;
};

const normalizeLiteralClassNames = (content: string): string =>
  content.replace(
    /\bclassName\s*=\s*(["'])([^"']+)\1/g,
    (_match, _quote: string, classValue: string) => {
      const classes = classValue.trim().split(/\s+/).filter(Boolean);
      if (!classes.length) return 'className={undefined}';
      const references = classes.map((className) =>
        /^[A-Za-z_$][\w$]*$/.test(className)
          ? `styles.${className}`
          : `styles[${JSON.stringify(className)}]`,
      );
      return `className={${references.join(" + ' ' + ")}}`;
    },
  );

/**
 * Generated interactive JSX can arrive without a stylesheet or with literal class names.
 * Attach a co-located CSS Module and generic layout class names so the preview is usable
 * without requiring another model turn.
 */
export const ensureCoLocatedCssModule = (
  path: string,
  content: string,
): { content: string; stylesheetPath: string; stylesheet: string } | null => {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  if (!/\bon(?:Click|Change|Submit|KeyDown)\b/.test(content)) return null;

  const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
  const importSpecifier = `./${stylesheetPath.split('/').pop()}`;
  const rewritten = normalizeLiteralClassNames(
    annotateInteractiveClassNames(insertCssModuleImport(content, importSpecifier)),
  );
  return {
    content: rewritten,
    stylesheetPath,
    stylesheet: `${formatCssModuleRules(cssModuleClassNames(rewritten))}\n`,
  };
};
