type BindingScopes = Map<string, Set<number>>;

type SourceScopeGraph = {
  scopeAt: number[];
  parents: number[];
};

type ArrowExpressionBinding = {
  name: string;
  start: number;
  end: number;
};

type DeclaredBindings = {
  bindings: BindingScopes;
  arrowExpressions: ArrowExpressionBinding[];
};

const previousWordAt = (content: string, index: number): string =>
  content
    .slice(0, index)
    .trimEnd()
    .match(/[A-Za-z_$][\w$]*$/)?.[0] || '';

const isSingleQuoteStringStart = (content: string, index: number): boolean => {
  const previousNonWhitespace = content.slice(0, index).trimEnd().at(-1) || '';
  return (
    !previousNonWhitespace ||
    /[=([{,:;?!>]/.test(previousNonWhitespace) ||
    /^(?:as|await|case|default|from|in|of|return|throw|typeof|void|yield)$/.test(
      previousWordAt(content, index),
    )
  );
};

/** Masks comments and literal text while preserving code inside ${...} expressions. */
const maskSourceLiterals = (content: string): string => {
  const masked = Array.from({ length: content.length }, (_, index) => content[index]);
  const blank = (index: number) => {
    if (content[index] !== '\n' && content[index] !== '\r') masked[index] = ' ';
  };

  const maskComment = (start: number, multiLine: boolean): number => {
    let index = start;
    while (index < content.length) {
      const char = content[index];
      blank(index);
      index += 1;
      if (
        (multiLine && char === '*' && content[index] === '/') ||
        (!multiLine && (char === '\n' || char === '\r'))
      ) {
        if (multiLine && content[index] === '/') {
          blank(index);
          index += 1;
        }
        break;
      }
    }
    return index;
  };

  const maskExpression = (start: number): number => {
    let index = start;
    let depth = 1;
    while (index < content.length) {
      const char = content[index];
      const next = content[index + 1];
      if (char === '/' && next === '/') {
        index = maskComment(index, false);
        continue;
      }
      if (char === '/' && next === '*') {
        index = maskComment(index, true);
        continue;
      }
      if (
        char === '"' ||
        char === '`' ||
        (char === "'" && isSingleQuoteStringStart(content, index))
      ) {
        index = maskQuoted(index, char as "'" | '"' | '`');
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
      index += 1;
    }
    return index;
  };

  const maskQuoted = (start: number, quote: "'" | '"' | '`'): number => {
    blank(start);
    let index = start + 1;
    while (index < content.length) {
      const char = content[index];
      if (char === '\\') {
        blank(index);
        if (index + 1 < content.length) blank(index + 1);
        index += 2;
        continue;
      }
      if (quote === '`' && char === '$' && content[index + 1] === '{') {
        masked[index] = '$';
        masked[index + 1] = '{';
        index = maskExpression(index + 2);
        continue;
      }
      blank(index);
      index += 1;
      if (char === quote) break;
    }
    return index;
  };

  let index = 0;
  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '/' && next === '/') {
      index = maskComment(index, false);
      continue;
    }
    if (char === '/' && next === '*') {
      index = maskComment(index, true);
      continue;
    }
    if (
      char === '"' ||
      char === '`' ||
      (char === "'" && isSingleQuoteStringStart(content, index))
    ) {
      index = maskQuoted(index, char as "'" | '"' | '`');
      continue;
    }
    index += 1;
  }
  return masked.join('');
};

const createScopeGraph = (source: string): SourceScopeGraph => {
  const scopeAt = new Array<number>(source.length).fill(0);
  const parents = [-1];
  const stack = [0];
  for (let index = 0; index < source.length; index++) {
    scopeAt[index] = stack[stack.length - 1];
    if (source[index] === '{') {
      const scope = parents.length;
      parents.push(stack[stack.length - 1]);
      stack.push(scope);
    } else if (source[index] === '}' && stack.length > 1) {
      stack.pop();
    }
  }
  return { scopeAt, parents };
};

const addBinding = (bindings: BindingScopes, name: string, scope: number): void => {
  const names = bindings.get(name) || new Set<number>();
  names.add(scope);
  bindings.set(name, names);
};

const addParameterNames = (bindings: BindingScopes, scope: number, parameters: string): void => {
  for (const name of parameters.match(/[A-Za-z_$][\w$]*/g) || []) {
    addBinding(bindings, name, scope);
  }
};

const findArrowExpressionEnd = (source: string, start: number): number => {
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '(') parentheses += 1;
    else if (char === ')') {
      if (parentheses === 0 && brackets === 0 && braces === 0) return index;
      parentheses -= 1;
    } else if (char === '[') brackets += 1;
    else if (char === ']') {
      if (brackets === 0 && parentheses === 0 && braces === 0) return index;
      brackets -= 1;
    } else if (char === '{') braces += 1;
    else if (char === '}') {
      if (braces === 0 && parentheses === 0 && brackets === 0) return index;
      braces -= 1;
    } else if (
      (char === ',' || char === ';') &&
      parentheses === 0 &&
      brackets === 0 &&
      braces === 0
    ) {
      return index;
    }
  }
  return source.length;
};

const addImportedBindings = (bindings: BindingScopes, content: string): void => {
  for (const match of content.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    const clause = match[1].trim();
    const defaultBinding = clause.split(',')[0]?.trim();
    if (defaultBinding && !defaultBinding.startsWith('{') && !defaultBinding.startsWith('*')) {
      addBinding(bindings, defaultBinding, 0);
    }
    const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (namespace) addBinding(bindings, namespace[1], 0);
    const named = /\{([\s\S]*?)\}/.exec(clause)?.[1] || '';
    for (const item of named.split(',')) {
      const local = item
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local && /^[A-Za-z_$][\w$]*$/.test(local)) addBinding(bindings, local, 0);
    }
  }
};

const declaredSourceBindings = (
  content: string,
  source: string,
  graph: SourceScopeGraph,
): DeclaredBindings => {
  const bindings: BindingScopes = new Map();
  const arrowExpressions: ArrowExpressionBinding[] = [];
  addImportedBindings(bindings, content);

  for (const match of source.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    addBinding(bindings, match[1], graph.scopeAt[match.index]);
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?:=|,|;)/g)) {
    addBinding(bindings, match[1], graph.scopeAt[match.index]);
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s*[\[{]([\s\S]*?)[\]}]\s*=/g)) {
    const scope = graph.scopeAt[match.index];
    for (const name of match[1].match(/[A-Za-z_$][\w$]*/g) || []) {
      addBinding(bindings, name, scope);
    }
  }
  for (const match of source.matchAll(/\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g)) {
    const openBrace = match.index + match[0].lastIndexOf('{');
    const bodyScope = graph.scopeAt[Math.min(openBrace + 1, source.length - 1)] ?? 0;
    addParameterNames(bindings, bodyScope, match[1]);
  }
  for (const match of source.matchAll(/(?:\(([^)]*)\)|\b([A-Za-z_$][\w$]*))\s*=>/g)) {
    const parameters = match[1] || match[2] || '';
    const bodyStart = match.index + match[0].length;
    const firstBodyChar = source.slice(bodyStart).search(/\S/);
    const bodyIndex = firstBodyChar < 0 ? source.length : bodyStart + firstBodyChar;
    if (source[bodyIndex] === '{') {
      const bodyScope = graph.scopeAt[Math.min(bodyIndex + 1, source.length - 1)] ?? 0;
      addParameterNames(bindings, bodyScope, parameters);
    } else {
      const end = findArrowExpressionEnd(source, bodyIndex);
      for (const name of parameters.match(/[A-Za-z_$][\w$]*/g) || []) {
        arrowExpressions.push({ name, start: bodyIndex, end });
      }
    }
  }
  for (const match of source.matchAll(
    /(?:^|[{,;])\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\(([^)]*)\)\s*\{/gm,
  )) {
    const openBrace = match.index + match[0].lastIndexOf('{');
    const bodyScope = graph.scopeAt[Math.min(openBrace + 1, source.length - 1)] ?? 0;
    addParameterNames(bindings, bodyScope, match[1]);
  }
  return { bindings, arrowExpressions };
};

const KNOWN_CALLABLE_GLOBALS = new Set([
  'alert',
  'Array',
  'ArrayBuffer',
  'atob',
  'Audio',
  'BigInt',
  'Blob',
  'Boolean',
  'BroadcastChannel',
  'btoa',
  'cancelAnimationFrame',
  'cancelIdleCallback',
  'clearInterval',
  'clearTimeout',
  'confirm',
  'CustomEvent',
  'DataView',
  'Date',
  'decodeURI',
  'decodeURIComponent',
  'DOMParser',
  'encodeURI',
  'encodeURIComponent',
  'Error',
  'Event',
  'EventSource',
  'fetch',
  'File',
  'FileReader',
  'FormData',
  'getComputedStyle',
  'Headers',
  'Image',
  'isFinite',
  'isNaN',
  'Map',
  'matchMedia',
  'MutationObserver',
  'Number',
  'Object',
  'open',
  'parseFloat',
  'parseInt',
  'PerformanceObserver',
  'print',
  'prompt',
  'queueMicrotask',
  'ReadableStream',
  'reportError',
  'RegExp',
  'requestAnimationFrame',
  'requestIdleCallback',
  'Request',
  'ResizeObserver',
  'Response',
  'scroll',
  'scrollBy',
  'scrollTo',
  'Set',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'String',
  'structuredClone',
  'Symbol',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  'Uint8Array',
  'WeakMap',
  'WeakSet',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  'XMLSerializer',
]);

const IGNORED_CALL_NAMES = new Set([
  'async',
  'catch',
  'default',
  'do',
  'for',
  'function',
  'if',
  'import',
  'new',
  'return',
  'super',
  'switch',
  'throw',
  'try',
  'while',
  'with',
]);

const KNOWN_JSX_HANDLER_VALUES = new Set(['false', 'Infinity', 'NaN', 'null', 'true', 'undefined']);

const isDeclaredInScope = (
  bindings: DeclaredBindings,
  graph: SourceScopeGraph,
  name: string,
  position: number,
): boolean => {
  const declaredScopes = bindings.bindings.get(name);
  if (
    bindings.arrowExpressions.some(
      (binding) => binding.name === name && position >= binding.start && position < binding.end,
    )
  ) {
    return true;
  }
  if (!declaredScopes) return false;
  let scope = graph.scopeAt[position] ?? 0;
  while (scope >= 0) {
    if (declaredScopes.has(scope)) return true;
    scope = graph.parents[scope] ?? -1;
  }
  return false;
};

/** Rejects bare JSX event-handler references that would fail at render time. */
const validateJsxEventHandlerReferences = (
  path: string,
  source: string,
  declared: DeclaredBindings,
  graph: SourceScopeGraph,
): string | null => {
  for (const match of source.matchAll(
    /\bon[A-Z][A-Za-z0-9]*\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g,
  )) {
    const name = match[1];
    const referenceIndex = (match.index ?? 0) + match[0].lastIndexOf(name);
    if (
      isDeclaredInScope(declared, graph, name, referenceIndex) ||
      KNOWN_CALLABLE_GLOBALS.has(name) ||
      KNOWN_JSX_HANDLER_VALUES.has(name)
    ) {
      continue;
    }
    return `Generated source for ${path} references undeclared event handler '${name}'. Define it inside the component or remove the handler before finishing.`;
  }
  return null;
};

/** Rejects render-time ReferenceErrors that bundling alone cannot detect. */
export function validateDeclaredFunctionCalls(path: string, content: string): string | null {
  if (!/\.(?:jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const source = maskSourceLiterals(content);
  const graph = createScopeGraph(source);
  const declared = declaredSourceBindings(content, source, graph);
  const eventHandlerError = validateJsxEventHandlerReferences(path, source, declared, graph);
  if (eventHandlerError) return eventHandlerError;
  for (const match of source.matchAll(/(?<![A-Za-z0-9_$?.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (
      isDeclaredInScope(declared, graph, name, match.index) ||
      KNOWN_CALLABLE_GLOBALS.has(name) ||
      IGNORED_CALL_NAMES.has(name) ||
      /^set[A-Z]/.test(name)
    ) {
      continue;
    }
    return `Generated source for ${path} calls undeclared function '${name}'. Define it inside the component or remove the call before finishing.`;
  }
  return null;
}
