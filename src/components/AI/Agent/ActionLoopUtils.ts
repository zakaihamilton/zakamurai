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
  const imports = [
    ...content.matchAll(/\bimport\s+(["'])(\.{1,2}\/[^"']+(?<!\.module)\.css)\1\s*;?/g),
  ];
  if (!imports.length) return null;

  const stylesheets = new Set<string>();
  let normalized = content.replace(
    /\bimport\s+(["'])(\.{1,2}\/[^"']+(?<!\.module)\.css)\1\s*;?/g,
    (_match, quote: string, specifier: string) => {
      const moduleSpecifier = specifier.replace(/\.css$/i, '.module.css');
      stylesheets.add(resolveRelativePath(path, moduleSpecifier));
      return `import styles from ${quote}${moduleSpecifier}${quote};`;
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

export const cssModuleRecovery = (content: string): string => {
  const classNames = [
    ...content.matchAll(/\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g),
  ].map((match) => match[1] || match[2]);
  const classes = new Set(classNames);
  const rules: Record<string, string> = {
    app: 'min-height: 100vh; padding: 2rem; color: #e2e8f0; background: #0f172a;',
    container:
      'width: min(100%, 42rem); margin: 0 auto; padding: 2rem; border-radius: 1.5rem; background: #172554; box-shadow: 0 24px 60px rgb(0 0 0 / 28%);',
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
    status:
      'justify-self: center; padding: 0.55rem 0.8rem; border-radius: 999px; background: rgb(255 255 255 / 12%); font-weight: 700;',
    result:
      'display: grid; min-height: 18rem; place-content: center; gap: 1rem; text-align: center;',
    winnerText: 'margin: 0; color: #fef08a; font-size: clamp(2rem, 9vw, 4rem);',
    resetBtn:
      'justify-self: center; padding: 0.7rem 1rem; color: #0f172a; font: inherit; font-weight: 800; background: #67e8f9; border: 0; border-radius: 0.75rem; cursor: pointer;',
    newGameBtn:
      'padding: 0.7rem 1rem; color: #0f172a; font: inherit; font-weight: 800; background: #67e8f9; border: 0; border-radius: 0.75rem; cursor: pointer;',
    footer: 'margin-top: 1.5rem; color: #94a3b8; text-align: center;',
  };
  const selectedRules = [...classes].map(
    (className) => `.${className} {\n  ${rules[className] || 'display: block;'}\n}`,
  );
  return selectedRules.join('\n\n') || '.component {\n  display: block;\n}\n';
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

const cssModuleClassNames = (content: string): Set<string> =>
  new Set(
    [
      ...content.matchAll(/\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g),
    ].map((match) => match[1] || match[2]),
  );

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
  const defined = new Set(
    [...content.matchAll(/\.([A-Za-z_-][\w-]*)\s*\{/g)].map((match) => match[1]),
  );
  return [...required].filter((className) => !defined.has(className));
};
