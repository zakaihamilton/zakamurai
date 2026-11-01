import { type ProjectStyleProfile, generateProjectCssModule } from './ProjectStyleProfile';

const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

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

const CSS_MODULE_RECOVERY_RULES: Record<string, string> = {
  app: 'display: grid; gap: 1.25rem; width: min(100%, 48rem); min-height: 100vh; margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem); color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05);',
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
    'justify-self: center; align-self: start; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-weight: 600; background: #4f46e5; border: 0; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease;',
  newGameBtn:
    'align-self: start; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-weight: 600; background: #4f46e5; border: 0; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease;',
  footer: 'margin-top: 1.5rem; color: #64748b; text-align: center;',
  button:
    'display: inline-flex; width: fit-content; max-width: 100%; min-height: 2.75rem; align-self: start; align-items: center; justify-content: center; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-size: 0.95rem; font-weight: 600; background: #4f46e5; border: none; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease, transform 150ms ease; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
  control:
    'display: block; box-sizing: border-box; flex: 1 1 18rem; min-width: 0; width: 100%; max-width: 100%; min-height: 2.75rem; padding: 0.7rem 0.85rem; color: #0f172a; font-family: inherit; font-size: 0.95rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem; transition: border-color 150ms ease;',
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
    'align-self: start; padding: 0.4rem 0.75rem; color: #ef4444; font-family: inherit; font-size: 0.85rem; font-weight: 600; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.375rem; cursor: pointer; transition: all 150ms ease;',
  form: 'display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem;',
  input:
    'flex: 1; min-width: 0; min-height: 2.75rem; padding: 0.7rem 0.85rem; color: #0f172a; font-family: inherit; font-size: 0.95rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem; transition: border-color 150ms ease;',
  addBtn:
    'align-self: start; min-height: 2.75rem; padding: 0.7rem 1.25rem; color: #ffffff; font-family: inherit; font-size: 0.95rem; font-weight: 600; background: #4f46e5; border: none; border-radius: 0.5rem; cursor: pointer; transition: background 150ms ease, transform 150ms ease; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
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

const recoveryRuleForClassName = (className: string, source = ''): string => {
  if (CSS_MODULE_RECOVERY_RULES[className]) return CSS_MODULE_RECOVERY_RULES[className];
  const normalized = className.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase();
  const token = (names: string) => new RegExp(`(?:^|-)(${names})(?:-|$)`).test(normalized);
  const isButton =
    token('button|btn|action') ||
    new RegExp(
      `<button\\b[^>]*\\bstyles(?:\\.${className}\\b|\\[\\s*["']${className}["']\\s*\\])`,
      'i',
    ).test(source);
  if (isButton && token('danger|delete|remove|destroy|clear'))
    return CSS_MODULE_RECOVERY_RULES.deleteBtn;
  if (isButton && token('secondary|cancel|reset|ghost')) return CSS_MODULE_RECOVERY_RULES.control;
  if (isButton) return CSS_MODULE_RECOVERY_RULES.button;
  if (token('header')) {
    return 'display: flex; min-width: 0; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;';
  }
  if (token('footer')) {
    return 'display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 0.75rem;';
  }
  if (token('main|section')) {
    return 'display: grid; min-width: 0; gap: 1rem;';
  }
  if (token('app|root|page|screen')) {
    return CSS_MODULE_RECOVERY_RULES.app;
  }
  if (token('shell|layout|wrapper|container|card|panel')) {
    return 'display: grid; gap: 1.25rem; width: min(100%, 52rem); margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem); color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05);';
  }
  if (token('list|grid|items|content|body|stack|columns')) {
    return 'display: grid; gap: 0.85rem;';
  }
  if (token('title|heading|label|status|message|text|caption')) {
    return 'color: #0f172a;';
  }
  if (token('form|field|group|row|toolbar|actions|controls|add|create|save|edit|new')) {
    return 'display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;';
  }
  if (token('item|entry|option|row|note|task|todo')) {
    return 'padding: 0.8rem 0.9rem; color: #0f172a; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;';
  }
  if (token('control|input|select|textarea')) {
    return 'min-height: 2.75rem; padding: 0.65rem 0.9rem; color: #0f172a; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.5rem;';
  }
  if (token('muted|hint|meta|secondary')) {
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

const legacyCssModuleRules = (
  classNames: Iterable<string>,
  includeBase: boolean,
  source = '',
): string => {
  const rules = [...classNames]
    .map((className) => `.${className} {\n  ${recoveryRuleForClassName(className, source)}\n}`)
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
    : `${legacyCssModuleRules(cssModuleClassNames(content), true, content)}\n`;

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
  const additions = [legacyCssModuleRules(missing, false, sourceContent)];
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
