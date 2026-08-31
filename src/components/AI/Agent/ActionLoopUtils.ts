import type { AgentAction } from '@/components/AI/types';
import { type ProjectStyleProfile, generateProjectCssModule } from './ProjectStyleProfile';

const MAX_REASONING_RESULT_CHARS = 3000;
const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

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

export const formatValidationSummary = (rawResult: string): string => {
  if (typeof rawResult !== 'string') return String(rawResult ?? '');
  const trimmed = rawResult.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        status?: string;
        check?: string;
        diagnostics?: string | string[];
      };
      if (parsed && typeof parsed === 'object' && parsed.status) {
        const isPassed = parsed.status === 'passed';
        const statusText = isPassed
          ? 'Build validation passed successfully.'
          : `Build validation status: ${parsed.status}.`;
        const diagnostics = Array.isArray(parsed.diagnostics)
          ? parsed.diagnostics.join('\n')
          : typeof parsed.diagnostics === 'string'
            ? parsed.diagnostics
            : '';
        return diagnostics ? `${statusText}\n${diagnostics}` : statusText;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  return rawResult;
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
  if (!search || !existing.includes(search)) {
    throw new Error('Target search block not found in file content.');
  }
  return existing.replace(search, replace);
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

  normalized = normalizeClassNameExpressions(normalized);

  return { content: normalized, stylesheets: [...stylesheets] };
};

const CSS_MODULE_RECOVERY_RULES: Record<string, string> = {
  app: 'min-height: 100vh; max-width: 48rem; margin: 2rem auto; padding: 2.5rem; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05);',
  container:
    'max-width: 42rem; margin: 0 auto; padding: 2rem; border-radius: 1rem; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05);',
  header:
    'display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; text-align: left;',
  title:
    'margin: 0 0 1rem 0; font-size: 2.25rem; font-weight: 800; color: #0f172a; letter-spacing: -0.03em;',
  scores: 'display: flex; justify-content: center; gap: 0.75rem;',
  scoreItem:
    'padding: 0.45rem 0.75rem; border-radius: 999px; background: #f1f5f9; font-weight: 600; color: #334155;',
  gameArea: 'display: grid; gap: 1.25rem;',
  board: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem;',
  grid: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem;',
  square:
    'aspect-ratio: 1; font-size: clamp(2rem, 11vw, 4.75rem); font-weight: 800; color: #0f172a; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.75rem; cursor: pointer; transition: all 150ms ease;',
  cell: 'aspect-ratio: 1; font-size: clamp(2rem, 11vw, 4.75rem); font-weight: 800; color: #0f172a; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.75rem; cursor: pointer; transition: all 150ms ease;',
  x: 'color: #4f46e5;',
  o: 'color: #06b6d4;',
  status:
    'justify-self: center; padding: 0.55rem 0.8rem; border-radius: 999px; background: #e0e7ff; font-weight: 600; color: #3730a3;',
  result: 'display: grid; min-height: 18rem; place-content: center; gap: 1rem; text-align: center;',
  resultText: 'margin: 0; color: #4f46e5; font-size: clamp(1.5rem, 6vw, 2.5rem); font-weight: 800;',
  winnerText: 'margin: 0; color: #4f46e5; font-size: clamp(2rem, 9vw, 4rem); font-weight: 800;',
  resetBtn:
    'justify-self: center; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-weight: 600; background: #4f46e5; border: 0; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease;',
  newGameBtn:
    'padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-weight: 600; background: #4f46e5; border: 0; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease;',
  footer: 'margin-top: 1.5rem; color: #64748b; text-align: center;',
  button:
    'min-height: 2.75rem; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-size: 0.95rem; font-weight: 600; background: #4f46e5; border: none; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease, transform 150ms ease; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
  control:
    'flex: 1 1 18rem; min-width: 0; min-height: 2.75rem; padding: 0.7rem 0.85rem; color: #0f172a; font-family: inherit; font-size: 0.95rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem; transition: border-color 150ms ease;',
  list: 'display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;',
  todoItem:
    'display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem; transition: all 150ms ease;',
  taskItem:
    'display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem; transition: all 150ms ease;',
  item: 'display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem; transition: all 150ms ease;',
  todoText: 'flex: 1; min-width: 0; font-size: 0.95rem; color: #0f172a; word-break: break-word;',
  completedText:
    'flex: 1; min-width: 0; font-size: 0.95rem; color: #64748b; text-decoration: line-through; opacity: 0.6;',
  checkbox:
    'width: 1.25rem; height: 1.25rem; accent-color: #4f46e5; cursor: pointer; flex-shrink: 0;',
  deleteBtn:
    'padding: 0.4rem 0.75rem; color: #ef4444; font-family: inherit; font-size: 0.85rem; font-weight: 600; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.375rem; cursor: pointer; transition: all 150ms ease;',
  form: 'display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem;',
  input:
    'flex: 1; min-width: 0; min-height: 2.75rem; padding: 0.7rem 0.85rem; color: #0f172a; font-family: inherit; font-size: 0.95rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem; transition: border-color 150ms ease;',
  addBtn:
    'min-height: 2.75rem; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-size: 0.95rem; font-weight: 600; background: #4f46e5; border: none; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease, transform 150ms ease; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
};

const hasInteractiveElements = (content: string): boolean =>
  /<(?:button|input|select|textarea)\b/i.test(content);

const hasInteractiveBase = (content: string): boolean =>
  /\.button\s*\{/.test(content) || /\.control\s*\{/.test(content);

const cssModuleClassNames = (content: string): Set<string> =>
  new Set(
    [
      ...content.matchAll(/\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g),
    ].map((match) => match[1] || match[2]),
  );

const interactiveCssModuleClassNames = (content: string): Set<string> =>
  new Set(
    [
      ...content.matchAll(
        /<(?:button|input|select|textarea)\b[^>]*\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/gis,
      ),
    ].map((match) => match[1] || match[2]),
  );

/** Replaces oversized fixed dimensions on generated controls with fluid sizing. */
const normalizeOversizedInteractiveRules = (stylesheet: string, source: string): string => {
  const interactiveClasses = interactiveCssModuleClassNames(source);
  if (!interactiveClasses.size) return stylesheet;

  let normalized = stylesheet;
  for (const className of interactiveClasses) {
    const rulePattern = new RegExp(`\\.${escapeRegExp(className)}\\s*\\{([^}]*)\\}`, 'i');
    const match = rulePattern.exec(normalized);
    if (!match) continue;
    const hasOversizedDimension = [
      ...match[1].matchAll(/\b(?:width|height)\s*:\s*(\d+(?:\.\d+)?)\s*(px|rem)\s*;/gi),
    ].some((dimension) =>
      dimension[2].toLowerCase() === 'px' ? Number(dimension[1]) > 96 : Number(dimension[1]) > 6,
    );
    if (!hasOversizedDimension) continue;

    const repairedBody = match[1]
      .replace(/\bwidth\s*:\s*\d+(?:\.\d+)?\s*(?:px|rem)\s*;/gi, 'width: min(100%, 12rem);')
      .replace(
        /\bheight\s*:\s*\d+(?:\.\d+)?\s*(?:px|rem)\s*;/gi,
        'height: auto; min-height: 2.75rem;',
      );
    normalized = `${normalized.slice(0, match.index)}.${className} {${repairedBody}}${normalized.slice(match.index + match[0].length)}`;
  }
  return normalized;
};

const definedCssModuleClassNames = (content: string): Set<string> =>
  new Set([...content.matchAll(/\.([A-Za-z_-][\w-]*)\s*\{/g)].map((match) => match[1]));

const recoveryRuleForClassName = (className: string): string => {
  if (CSS_MODULE_RECOVERY_RULES[className]) return CSS_MODULE_RECOVERY_RULES[className];
  const normalized = className.toLowerCase();
  if (/(?:app|root|page|screen|shell|layout|wrapper|container|card|panel)/.test(normalized)) {
    return 'display: grid; gap: 1.25rem; width: min(100%, 52rem); margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem); color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05);';
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
    return 'padding: 0.8rem 0.9rem; color: #0f172a; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;';
  }
  if (/(?:button|btn|control|input|select|textarea|action)/.test(normalized)) {
    return 'min-height: 2.75rem; padding: 0.65rem 0.9rem; color: #0f172a; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem;';
  }
  if (/(?:muted|hint|meta|footer|secondary)/.test(normalized)) {
    return 'color: #475569;';
  }
  return 'display: block; box-sizing: border-box; color: #0f172a;';
};

const LEGACY_RECOVERY_BASE = `:global(:root), :global(body) {
  margin: 0;
  min-height: 100vh;
  color: #0f172a;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

:global(*), :global(*::before), :global(*::after) {
  box-sizing: border-box;
}`;

const legacyCssModuleRules = (classNames: Iterable<string>, includeBase: boolean): string => {
  const rules = [...classNames]
    .map((className) => `.${className} {\n  ${recoveryRuleForClassName(className)}\n}`)
    .join('\n\n');
  return [includeBase ? LEGACY_RECOVERY_BASE : '', rules || '.component {\n  display: block;\n}']
    .filter(Boolean)
    .join('\n\n');
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

export const cssModuleRecovery = (
  content: string,
  profile?: ProjectStyleProfile,
  stylesheetPath = 'src/App.module.css',
): string =>
  profile
    ? generateProjectCssModule({ source: content, stylesheetPath, profile })
    : `${legacyCssModuleRules(cssModuleClassNames(content), true)}\n`;

/**
 * When a JSX/TSX write imports an existing CSS Module that does not define the
 * `styles.*` classes the component uses, return those stylesheet paths.
 * (missingCssModuleImports only covers entirely absent files.)
 */
export const incompleteCssModuleImports = (
  path: string,
  content: string,
  files: Record<string, string>,
  options: { forceLayoutRecovery?: boolean } = {},
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
      LEGACY_RECOVERY_SIGNATURE.test(files[stylesheetPath]) ||
      (options.forceLayoutRecovery && hasInteractiveElements(content))
    );
  });
};

/** Append recovered rules for classes referenced by source but missing from an existing stylesheet. */
export const appendMissingCssModuleRules = (
  existingCss: string,
  sourceContent: string,
  profile?: ProjectStyleProfile,
  stylesheetPath = 'src/App.module.css',
  options: { forceLayoutRecovery?: boolean } = {},
): string | null => {
  const required = cssModuleClassNames(sourceContent);
  const normalizedExistingCss = normalizeLegacyRecoveryStylesheet(existingCss);
  const defined = definedCssModuleClassNames(normalizedExistingCss);
  const missing = [...required].filter((className) => !defined.has(className));
  const needsInteractiveBase =
    hasInteractiveElements(sourceContent) && !hasInteractiveBase(normalizedExistingCss);
  const wasNormalized = normalizedExistingCss !== existingCss;
  if (!missing.length && !needsInteractiveBase && !wasNormalized && !options.forceLayoutRecovery) {
    return null;
  }

  if (profile) {
    let generated = generateProjectCssModule({
      source: sourceContent,
      stylesheetPath,
      profile,
      existingCss: normalizedExistingCss,
    });
    if (
      defined.has('container') &&
      missing.some((className) => className === 'cell' || className === 'square')
    ) {
      generated +=
        '\n.container {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: var(--space);\n}\n';
    }
    return generated;
  }
  const additions = [legacyCssModuleRules(missing, false)];
  if (
    defined.has('container') &&
    missing.some((className) => className === 'cell' || className === 'square')
  ) {
    additions.unshift(
      '.container {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 0.65rem;\n}',
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
  profile?: ProjectStyleProfile,
): Array<{ path: string; content: string }> => {
  const next = { ...files };
  const updated = new Set<string>();

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx|tsx)$/i.test(path)) continue;
    for (const stylesheet of missingCssModuleImports(path, content, next)) {
      next[stylesheet] = cssModuleRecovery(content, profile, stylesheet);
      updated.add(stylesheet);
    }
  }

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx|tsx)$/i.test(path)) continue;
    for (const stylesheet of incompleteCssModuleImports(path, content, next, {
      forceLayoutRecovery: Boolean(profile),
    })) {
      const merged = appendMissingCssModuleRules(
        next[stylesheet] || '',
        content,
        profile,
        stylesheet,
        { forceLayoutRecovery: Boolean(profile) },
      );
      if (!merged || merged === next[stylesheet]) continue;
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
  profile?: ProjectStyleProfile,
  options: { responsive?: boolean } = {},
): string => {
  let repaired = content;
  for (const importer of cssModuleImporters(stylesheetPath, files)) {
    const merged = appendMissingCssModuleRules(
      repaired,
      files[importer] || '',
      profile,
      stylesheetPath,
    );
    if (merged) repaired = merged;
  }
  return options.responsive
    ? normalizeOversizedInteractiveRules(
        repaired,
        cssModuleImporters(stylesheetPath, files)
          .map((path) => files[path] || '')
          .join('\n'),
      )
    : repaired;
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

const findJsxTagEnd = (content: string, start: number): number => {
  let quote: string | null = null;
  let braceDepth = 0;
  let escaped = false;
  for (let index = start; index < content.length; index++) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === '>' && braceDepth === 0) return index;
  }
  return -1;
};

const findMatchingJsxClose = (content: string, openEnd: number, tagName: string): number => {
  let depth = 1;
  for (let index = openEnd + 1; index < content.length; index++) {
    if (content[index] !== '<') continue;
    const tagEnd = findJsxTagEnd(content, index + 1);
    if (tagEnd < 0) return -1;
    const tag = content.slice(index + 1, tagEnd).trim();
    const closing = tag.startsWith('/');
    const normalizedTag = (closing ? tag.slice(1) : tag).trim();
    const nameMatch = /^([A-Za-z][\w.-]*)\b/.exec(normalizedTag);
    if (!nameMatch || nameMatch[1] !== tagName) {
      index = tagEnd;
      continue;
    }
    if (closing) {
      depth -= 1;
      if (depth === 0) return index;
    } else if (!/\/\s*$/.test(normalizedTag)) {
      depth += 1;
    }
    index = tagEnd;
  }
  return -1;
};

type FunctionSpan = {
  name: string;
  start: number;
  end: number;
  body: string;
};

const topLevelFunctionSpans = (content: string): FunctionSpan[] => {
  const functions: FunctionSpan[] = [];
  for (const match of content.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    const start = match.index ?? 0;
    const openIndex = start + match[0].length - 1;
    const body = extractBalancedBraces(content, openIndex);
    if (!body) continue;
    if (functions.some((candidate) => start > candidate.start && start < candidate.end)) continue;
    functions.push({ name: match[1], start, end: openIndex + body.length, body });
  }
  return functions;
};

const normalizeExternalStateCallbacks = (content: string): string => {
  const setters = [
    ...content.matchAll(
      /\bconst\s*\[\s*[A-Za-z_$][\w$]*\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\b/g,
    ),
  ].map((match) => match[1]);
  if (!setters.length) return content;

  const functions = topLevelFunctionSpans(content);
  const component = functions.find((candidate) => /\buseState\b/.test(candidate.body));
  if (!component) return content;
  const externalCallbacks = functions.filter(
    (candidate) =>
      candidate !== component &&
      setters.some((setter) => new RegExp(`\\b${setter}\\s*\\(`).test(candidate.body)),
  );
  if (!externalCallbacks.length) return content;

  const moved = externalCallbacks
    .map((callback) => content.slice(callback.start, callback.end).replace(/^/gm, '  '))
    .join('\n\n');
  let normalized = content;
  for (const callback of [...externalCallbacks].sort((left, right) => right.start - left.start)) {
    const lineStart = normalized.lastIndexOf('\n', callback.start - 1) + 1;
    const removalStart = /^\s*$/.test(normalized.slice(lineStart, callback.start))
      ? lineStart
      : callback.start;
    const afterFunction =
      callback.end < normalized.length && normalized[callback.end] === '\n'
        ? callback.end + 1
        : callback.end;
    normalized = `${normalized.slice(0, removalStart)}${normalized.slice(afterFunction)}`;
  }

  const componentMatch = new RegExp(`\\bfunction\\s+${component.name}\\s*\\([^)]*\\)\\s*\\{`).exec(
    normalized,
  );
  if (!componentMatch || componentMatch.index === undefined) return content;
  const componentOpen = componentMatch.index + componentMatch[0].length - 1;
  return `${normalized.slice(0, componentOpen + 1)}\n${moved}\n${normalized.slice(componentOpen + 1)}`;
};

/** Converts safe mapped collection item click targets into semantic buttons. */
const normalizeMappedInteractiveElements = (content: string): string => {
  const mapPattern =
    /\.map\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\(\s*)?<(?<tag>div|span)\b/i;
  let normalized = content;
  let searchStart = 0;
  while (searchStart < normalized.length) {
    const match = mapPattern.exec(normalized.slice(searchStart));
    if (!match?.groups?.tag || match.index === undefined) break;
    const openStart = searchStart + match.index + match[0].lastIndexOf('<');
    const tagName = match.groups.tag.toLowerCase();
    const openEnd = findJsxTagEnd(normalized, openStart + 1);
    if (openEnd < 0) break;
    const openingTag = normalized.slice(openStart, openEnd + 1);
    if (!/\bonClick\s*=/.test(openingTag)) {
      searchStart = openEnd + 1;
      continue;
    }
    const replacementOpening = `<button type="button"${openingTag.slice(1 + tagName.length, -1)}>`;
    if (/\/\s*>$/.test(openingTag)) {
      normalized = `${normalized.slice(0, openStart)}${replacementOpening}${normalized.slice(openEnd + 1)}`;
      searchStart = openStart + replacementOpening.length;
      continue;
    }
    const closeStart = findMatchingJsxClose(normalized, openEnd, tagName);
    if (closeStart < 0) break;
    normalized = `${normalized.slice(0, openStart)}${replacementOpening}${normalized.slice(openEnd + 1, closeStart)}</button>${normalized.slice(closeStart + tagName.length + 3)}`;
    searchStart = openStart + replacementOpening.length;
  }
  return normalized;
};

const normalizeHardCodedTurnGuards = (content: string): string => {
  let normalized = content;
  const declarations = [
    ...content.matchAll(
      /\bconst\s*\[\s*((?:current|active)(?:Player|Turn))\s*,\s*(set[A-Z][A-Za-z0-9_$]*)\s*\]\s*=\s*useState\b/gi,
    ),
  ];

  for (const declaration of declarations) {
    const stateName = declaration[1];
    const setterName = declaration[2];
    const advancesTurn = new RegExp(
      `\\b${escapeRegExp(setterName)}\\s*\\(\\s*${escapeRegExp(stateName)}\\s*===|\\b${escapeRegExp(setterName)}\\s*\\(\\s*prev[A-Za-z_$]*\\s*=>`,
      'i',
    ).test(normalized);
    if (!advancesTurn) continue;

    const guardExpression = `(?:${escapeRegExp(stateName)}\\s*!==?\\s*["'][^"']+["']|["'][^"']+["']\\s*!==?\\s*${escapeRegExp(stateName)})`;
    const guardInIf = /\bif\s*\(([^()]*)\)\s*(?:\{\s*)?return\s*;\s*(?:\})?/gi;
    normalized = normalized.replace(guardInIf, (statement, condition: string) => {
      if (!new RegExp(guardExpression, 'i').test(condition)) return statement;
      const cleanedCondition = condition
        .replace(
          new RegExp(
            `(?:\\s*(?:\\|\\||&&)\\s*${guardExpression}|${guardExpression}\\s*(?:\\|\\||&&)?\\s*)`,
            'i',
          ),
          '',
        )
        .trim();
      return cleanedCondition ? statement.replace(condition, cleanedCondition) : '';
    });
  }

  return normalized;
};

/** Wires a generated form's no-op submit handler to the component's add/create handler. */
const normalizeNoOpCollectionSubmit = (content: string): string => {
  const handlerMatch =
    /\b(?:const|let|function)\s+((?:handle|on)?(?:add|create|save|submit|new)[A-Za-z0-9_$]*)\s*(?:=|\()/i.exec(
      content,
    );
  if (!handlerMatch) return content;

  const noOpSubmit =
    /onSubmit\s*=\s*\{\s*(?:\(([A-Za-z_$][\w$]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*(?:\{\s*)?\2?\1?\.preventDefault\(\)\s*;?\s*\}?\s*\}/i;
  if (!noOpSubmit.test(content)) return content;

  const eventName = 'event';
  return content.replace(
    noOpSubmit,
    `onSubmit={(${eventName}) => { ${eventName}.preventDefault(); ${handlerMatch[1]}(); }}`,
  );
};

/**
 * Repairs a common stale-derived-state shape from small local models: a next
 * collection is prepared, its setter is called, and a zero-argument calculator
 * immediately reads the old collection. The default keeps direct callers valid.
 */
const normalizeStaleDerivedState = (content: string): string => {
  let normalized = content;
  const stateDeclarations = [
    ...content.matchAll(
      /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Z][A-Za-z0-9_$]*)\s*\]\s*=\s*useState\b/g,
    ),
  ];
  const functionPattern =
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*\)\s*=>\s*\{/g;

  for (const stateDeclaration of stateDeclarations) {
    const stateName = stateDeclaration[1];
    const setterName = stateDeclaration[2];
    const nextValueMatches = [
      ...normalized.matchAll(
        new RegExp(
          `\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[^;\\n]*\\b${escapeRegExp(stateName)}\\b[^;\\n]*;`,
          'g',
        ),
      ),
    ];
    if (!nextValueMatches.length) continue;

    for (const nextValueMatch of nextValueMatches) {
      const nextValueName = nextValueMatch[1];
      const conciseFunctions = [
        ...normalized.matchAll(
          /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*\)\s*=>\s*([^;\n]+);/g,
        ),
      ];
      for (const conciseFunction of conciseFunctions) {
        const functionName = conciseFunction[1];
        const expression = conciseFunction[2];
        if (!new RegExp(`\\b${escapeRegExp(stateName)}\\s*(?:\\.|\\[)`).test(expression)) {
          continue;
        }
        const setterMatch = new RegExp(
          `\\b${escapeRegExp(setterName)}\\s*\\(\\s*${escapeRegExp(nextValueName)}\\s*\\)`,
        ).exec(normalized);
        if (!setterMatch) continue;
        const callMatch = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(\\s*\\)`).exec(
          normalized.slice(setterMatch.index + setterMatch[0].length),
        );
        if (!callMatch || callMatch.index > 500) continue;
        const absoluteCallIndex = setterMatch.index + setterMatch[0].length + callMatch.index;
        normalized = `${normalized.slice(0, absoluteCallIndex)}${callMatch[0].replace(
          /\(\s*\)\s*$/,
          `(${nextValueName})`,
        )}${normalized.slice(absoluteCallIndex + callMatch[0].length)}`;
        const definition = new RegExp(
          `(\\b(?:const|let)\\s+${escapeRegExp(functionName)}\\s*=\\s*)\\(\\s*\\)\\s*=>\\s*([^;\\n]+);`,
        ).exec(normalized);
        if (!definition) break;
        const repairedExpression = definition[2].replace(
          new RegExp(`\\b${escapeRegExp(stateName)}\\b`, 'g'),
          nextValueName,
        );
        normalized = `${normalized.slice(0, definition.index)}${definition[1]}(${nextValueName} = ${stateName}) => ${repairedExpression};${normalized.slice(definition.index + definition[0].length)}`;
        break;
      }
    }

    const functions = [...normalized.matchAll(functionPattern)];
    for (const functionMatch of functions) {
      const functionName = functionMatch[1] || functionMatch[2];
      const openBrace = (functionMatch.index ?? 0) + functionMatch[0].length - 1;
      const functionBody = extractBalancedBraces(normalized, openBrace);
      if (
        !functionBody ||
        !new RegExp(`\\b${escapeRegExp(stateName)}\\s*(?:\\.|\\[)`).test(functionBody)
      ) {
        continue;
      }

      for (const nextValueMatch of nextValueMatches) {
        const nextValueName = nextValueMatch[1];
        const setterPattern = new RegExp(
          `\\b${escapeRegExp(setterName)}\\s*\\(\\s*${escapeRegExp(nextValueName)}\\s*\\)`,
          'g',
        );
        const setterMatch = setterPattern.exec(normalized);
        if (!setterMatch) continue;
        const callPattern = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(\\s*\\)`, 'g');
        callPattern.lastIndex = setterMatch.index + setterMatch[0].length;
        const callMatch = callPattern.exec(normalized);
        if (!callMatch || callMatch.index - setterMatch.index > 500) continue;

        normalized = `${normalized.slice(0, callMatch.index)}${callMatch[0].replace(
          /\(\s*\)\s*$/,
          `(${nextValueName})`,
        )}${normalized.slice(callMatch.index + callMatch[0].length)}`;

        const refreshedFunction = new RegExp(
          `(\\bfunction\\s+${escapeRegExp(functionName)}\\s*)\\(\\s*\\)(\\s*\\{)|((?:\\bconst|\\blet)\\s+${escapeRegExp(functionName)}\\s*=\\s*\\(\\s*)\\)(\\s*=>\\s*\\{)`,
          'g',
        ).exec(normalized);
        if (!refreshedFunction) break;
        const refreshedOpenBrace = (refreshedFunction.index ?? 0) + refreshedFunction[0].length - 1;
        const refreshedBody = extractBalancedBraces(normalized, refreshedOpenBrace);
        if (!refreshedBody) break;
        const parameter = `${nextValueName} = ${stateName}`;
        const bodyStart = refreshedOpenBrace;
        const bodyEnd = bodyStart + refreshedBody.length;
        const bodyContent = refreshedBody
          .slice(1, -1)
          .replace(new RegExp(`\\b${escapeRegExp(stateName)}\\b`, 'g'), nextValueName);
        const definition = refreshedFunction[1]
          ? `${refreshedFunction[1]}(${parameter})${refreshedFunction[2]}`
          : `${refreshedFunction[3]}${parameter})${refreshedFunction[4]}`;
        normalized = `${normalized.slice(0, refreshedFunction.index)}${definition}${bodyContent}}${normalized.slice(bodyEnd)}`;
        break;
      }
    }
  }

  return normalized;
};

export const normalizeGeneratedInteractiveSource = (content: string): string =>
  normalizeStaleDerivedState(normalizeNoOpCollectionSubmit(normalizeHardCodedTurnGuards(content)));

const staticTemplateClassNames = (template: string): string[] => {
  const body = template.slice(1, -1);
  let staticText = '';
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '$' && body[index + 1] === '{') {
      const expression = extractBalancedBraces(body, index + 1);
      if (expression) {
        staticText += ' ';
        index += expression.length;
        continue;
      }
    }
    staticText += body[index];
  }
  return staticText.match(/[A-Za-z_-][\w-]*/g) || [];
};

const normalizeClassNameExpressions = (content: string): string => {
  let normalized = normalizeExternalStateCallbacks(
    normalizeMappedInteractiveElements(content),
  ).replace(/className\s*=\s*(["'])([^"']+)\1/g, (_match, _quote: string, classValue: string) => {
    const classes = classValue.trim().split(/\s+/).filter(Boolean);
    if (!classes.length) return 'className={undefined}';
    const references = classes.map((className) =>
      /^[A-Za-z_$][\w$]*$/.test(className)
        ? `styles.${className}`
        : `styles[${JSON.stringify(className)}]`,
    );
    if (references.length === 1) return `className={${references[0]}}`;
    return `className={${references.join(" + ' ' + ")}}`;
  });
  const templateMatches = [...normalized.matchAll(/className\s*=\s*\{/g)];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const match of templateMatches) {
    const openIndex = (match.index || 0) + match[0].length - 1;
    const expression = extractBalancedBraces(normalized, openIndex);
    if (!expression) continue;
    const value = expression.slice(1, -1).trim();
    if (!value.startsWith('`') || !value.endsWith('`')) continue;
    const classes = staticTemplateClassNames(value);
    const references = classes.map((className) =>
      /^[A-Za-z_$][\w$]*$/.test(className)
        ? `styles.${className}`
        : `styles[${JSON.stringify(className)}]`,
    );
    replacements.push({
      start: match.index || 0,
      end: openIndex + expression.length,
      value: references.length
        ? references.length === 1
          ? `className={${references[0]}}`
          : `className={[${references.join(', ')}].filter(Boolean).join(' ')}`
        : 'className={undefined}',
    });
  }
  for (const replacement of replacements.reverse()) {
    normalized = `${normalized.slice(0, replacement.start)}${replacement.value}${normalized.slice(replacement.end)}`;
  }
  return normalized;
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

/**
 * Generated interactive JSX can arrive without a stylesheet or with literal class names.
 * Attach a co-located CSS Module and generic layout class names so the preview is usable
 * without requiring another model turn. Static layouts that already bind `styles.*` only
 * need the missing stylesheet — do not rewrite their className expressions.
 */
export const ensureCoLocatedCssModule = (
  path: string,
  content: string,
  profile?: ProjectStyleProfile,
): { content: string; stylesheetPath: string; stylesheet: string } | null => {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  const isInteractive = /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  const usesCssModule =
    /\bstyles(?:\.[A-Za-z_]|\[)/.test(content) ||
    /\bimport\s+\w+\s+from\s+['"][^"']+\.module\.css['"]/.test(content);
  if (!isInteractive && !usesCssModule) return null;

  const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
  const importSpecifier = `./${stylesheetPath.split('/').pop()}`;
  const rewritten = isInteractive
    ? normalizeClassNameExpressions(
        annotateInteractiveClassNames(insertCssModuleImport(content, importSpecifier)),
      )
    : insertCssModuleImport(content, importSpecifier);
  return {
    content: rewritten,
    stylesheetPath,
    stylesheet: profile
      ? generateProjectCssModule({ source: rewritten, stylesheetPath, profile })
      : cssModuleRecovery(rewritten, undefined, stylesheetPath),
  };
};
