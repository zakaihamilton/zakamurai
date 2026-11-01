import { stripComments } from '../ChangeValidatorSyntax';

const REACT_HOOKS = [
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useReducer',
  'useContext',
  'useId',
] as const;

const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

const prependImport = (content: string, importStatement: string): string => {
  const directiveMatch =
    /^((\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)(['"]use (?:client|server)['"];?))\s*(\n|$)/i.exec(
      content,
    );
  if (directiveMatch) {
    const prefix = directiveMatch[1];
    const rest = content.slice(directiveMatch[0].length);
    return `${prefix}\n${importStatement}\n${rest}`;
  }
  return `${importStatement}\n${content}`;
};

const extractBalancedBraces = (text: string, openIndex: number): string | null => {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && text[index + 1] === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
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
    if (char === '/' && text[index + 1] === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      inBlockComment = true;
      index += 1;
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

/**
 * Automatically injects missing React hook named imports (`useState`, `useEffect`, etc.)
 * when a small local model calls them bare without importing from `'react'`.
 */
export function repairMissingReactHookImports(content: string): string {
  const clean = stripComments(content);
  const missingHooks: string[] = [];

  for (const hook of REACT_HOOKS) {
    const bareCallPattern = new RegExp(`(?<!\\.)\\b${hook}\\s*(?:<[^>]*>)?\\s*\\(`, 'g');
    if (!bareCallPattern.test(clean)) continue;
    const declaredOrImported =
      new RegExp(`\\bimport\\b[^;\\n]*\\b${hook}\\b[^;\\n]*\\bfrom\\s*['"]react['"]`).test(clean) ||
      new RegExp(`\\b(?:const|let|var|function)\\s+${hook}\\b`).test(clean) ||
      new RegExp(`\\bconst\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}\\s*=\\s*React\\b`).test(clean);
    if (!declaredOrImported) {
      missingHooks.push(hook);
    }
  }

  if (!missingHooks.length) return content;

  const reactNamedImport =
    /^(\s*import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{)([^}]*)(\}\s*from\s*(['"])react\4\s*;?)/m;
  const namedMatch = reactNamedImport.exec(content);
  if (namedMatch) {
    const existingNames = namedMatch[2]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const merged = [...new Set([...existingNames, ...missingHooks])].join(', ');
    return content.replace(reactNamedImport, `$1 ${merged} $3`);
  }

  const reactDefaultImport = /^(\s*import\s+([A-Za-z_$][\w$]*)\s+from\s*(['"])react\3\s*;?)/m;
  const defaultMatch = reactDefaultImport.exec(content);
  if (defaultMatch) {
    const defaultBinding = defaultMatch[2];
    const quote = defaultMatch[3];
    return content.replace(
      reactDefaultImport,
      `import ${defaultBinding}, { ${missingHooks.join(', ')} } from ${quote}react${quote};`,
    );
  }

  return prependImport(content, `import { ${missingHooks.join(', ')} } from 'react';`);
}

/**
 * Repairs `const [count] = useState(...)` when `setCount(...)` is called in the component
 * without having destructured the setter from `useState`.
 */
export function repairMissingStateSetterDestructuring(content: string): string {
  const clean = stripComments(content);
  const singleDestructured = [
    ...clean.matchAll(/\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\.)?useState\b/g),
  ];
  if (!singleDestructured.length) return content;

  let repaired = content;
  for (const match of singleDestructured) {
    const stateVar = match[1];
    if (!stateVar) continue;
    const expectedSetter = `set${stateVar[0].toUpperCase()}${stateVar.slice(1)}`;
    const setterUsed = new RegExp(`(?<!\\.)\\b${escapeRegExp(expectedSetter)}\\s*\\(`).test(clean);
    const setterDeclared = new RegExp(
      `\\b(?:const|let|var|function)\\s+${escapeRegExp(expectedSetter)}\\b|\\[\\s*[^\\]]*\\b${escapeRegExp(expectedSetter)}\\b[^\\]]*\\]`,
    ).test(clean);
    if (!setterUsed || setterDeclared) continue;

    repaired = repaired.replace(
      new RegExp(
        `(\\bconst\\s*\\[\\s*${escapeRegExp(stateVar)})(\\s*\\]\\s*=\\s*(?:React\\.)?useState\\b)`,
      ),
      `$1, ${expectedSetter}$2`,
    );
  }
  return repaired;
}

/**
 * Normalizes HTML attribute aliases (`class=` -> `className=`, `for=` -> `htmlFor=`)
 * inside JSX opening tags so small models do not fail React DOM conventions.
 */
export function repairJsxAttributeAliases(content: string): string {
  return content.replace(/(<[A-Za-z][\w.-]*\b[^>]*?>)/g, (openingTag) =>
    openingTag
      .replace(/(\s)class\s*=\s*(?=["'{])/g, '$1className=')
      .replace(/(\s)for\s*=\s*(?=["'{])/g, '$1htmlFor='),
  );
}

type TopLevelFunctionSpan = {
  name: string;
  start: number;
  end: number;
  fullText: string;
  isDefaultExport: boolean;
  isNamedExport: boolean;
};

const extractTopLevelFunctions = (content: string): TopLevelFunctionSpan[] => {
  const spans: TopLevelFunctionSpan[] = [];
  const pattern =
    /(?:^|\n)([ \t]*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{)/g;

  for (const match of content.matchAll(pattern)) {
    const fullMatch = match[0];
    const prefixNewline = fullMatch.startsWith('\n') ? 1 : 0;
    const start = (match.index ?? 0) + prefixNewline;
    const header = match[1];
    const name = match[2];
    const openBraceIndex = start + header.length - 1;
    const body = extractBalancedBraces(content, openBraceIndex);
    if (!body) continue;
    const end = openBraceIndex + body.length;
    if (spans.some((existing) => start >= existing.start && start < existing.end)) continue;
    spans.push({
      name,
      start,
      end,
      fullText: content.slice(start, end),
      isDefaultExport: /\bexport\s+default\b/.test(header),
      isNamedExport: /\bexport\s+(?!default\b)/.test(header),
    });
  }
  return spans;
};

/**
 * When editing an existing multi-function file (e.g., a component file with helper functions)
 * and a small model outputs only a single updated function/component, deterministically
 * splice the updated function into the existing file and preserve sibling functions and imports.
 */
export function spliceSymbolScopedWrite(
  existingContent: string | undefined,
  incomingContent: string,
  path: string,
): string {
  if (!existingContent || !/\.(?:jsx|tsx|js|ts)$/i.test(path)) return incomingContent;
  if (
    /<h1>\s*New Project\s*<\/h1>/i.test(existingContent) ||
    /Start coding here\.\.\./i.test(existingContent)
  ) {
    return incomingContent;
  }

  const existingFunctions = extractTopLevelFunctions(existingContent);
  if (existingFunctions.length < 2) return incomingContent;

  const incomingFunctions = extractTopLevelFunctions(incomingContent);
  if (incomingFunctions.length !== 1) return incomingContent;

  const incomingFn = incomingFunctions[0];
  const targetFn = existingFunctions.find((fn) => fn.name === incomingFn.name);
  if (!targetFn) return incomingContent;

  // Ensure the incoming payload has no extra top-level statements outside imports and the single function.
  const withoutFunction =
    incomingContent.slice(0, incomingFn.start) + incomingContent.slice(incomingFn.end);
  const nonImportRemainder = stripComments(withoutFunction)
    .replace(/^\s*import\b[^\n;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, '')
    .trim();
  if (nonImportRemainder.length > 0) return incomingContent;

  let replacementText = incomingFn.fullText;
  if (targetFn.isDefaultExport && !incomingFn.isDefaultExport) {
    replacementText = replacementText.replace(
      /^(\s*)(?:export\s+)?(?=async\s+function|function\b)/,
      '$1export default ',
    );
  } else if (targetFn.isNamedExport && !incomingFn.isNamedExport && !incomingFn.isDefaultExport) {
    replacementText = replacementText.replace(/^(\s*)(?=async\s+function|function\b)/, '$1export ');
  }

  let spliced =
    existingContent.slice(0, targetFn.start) +
    replacementText +
    existingContent.slice(targetFn.end);

  const incomingImports = [
    ...incomingContent.matchAll(/^\s*import\b[^\n;]*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm),
  ];
  for (const importMatch of incomingImports) {
    const importLine = importMatch[0].trim();
    const specifier = importMatch[1];
    if (!new RegExp(`\\bfrom\\s*['"]${escapeRegExp(specifier)}['"]`).test(spliced)) {
      spliced = prependImport(spliced, importLine);
    }
  }

  return spliced;
}

/**
 * Runs deterministic AST/Hook/JSX auto-repairs on incoming JSX/TSX writes before validation.
 */
export function autoRepairGeneratedJsxSource(
  path: string,
  content: string,
  existingContent?: string,
): string {
  if (!/\.(?:jsx|tsx)$/i.test(path) || typeof content !== 'string') return content;
  const spliced = spliceSymbolScopedWrite(existingContent, content, path);
  const jsxNormalized = repairJsxAttributeAliases(spliced);
  const setterRepaired = repairMissingStateSetterDestructuring(jsxNormalized);
  return repairMissingReactHookImports(setterRepaired);
}
