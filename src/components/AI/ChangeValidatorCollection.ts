const controlledTextEntry =
  /<(?:input|textarea)\b(?=[^>]*\bon(?:Change|Input)\s*=)(?![^>]*\btype\s*=\s*["'](?:checkbox|radio|hidden)["'])[^>]*>/i;

const functionBody = (content: string, start: number): string => {
  const open = content.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < content.length; index++) {
    if (content[index] === '{') depth += 1;
    else if (content[index] === '}' && --depth === 0) return content.slice(open, index + 1);
  }
  return content.slice(open);
};

const matchingBraceEnd = (content: string, openIndex: number): number => {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = openIndex; index < content.length; index++) {
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
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  return content.length;
};

const matchingDelimiterEnd = (
  content: string,
  openIndex: number,
  opening: string,
  closing: string,
): number => {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = openIndex; index < content.length; index++) {
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
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === opening) depth += 1;
    else if (char === closing && --depth === 0) return index;
  }
  return content.length;
};

const mappedExpressionRanges = (content: string): Array<[number, number]> =>
  [...content.matchAll(/\.map\s*\(/g)].map((match) => {
    const start = match.index ?? 0;
    const openIndex = start + match[0].lastIndexOf('(');
    return [start, matchingDelimiterEnd(content, openIndex, '(', ')')];
  });

const isInsideMappedExpression = (position: number, ranges: Array<[number, number]>): boolean =>
  ranges.some(([start, end]) => position >= start && position < end);

const setterCall = (setter: string): RegExp => new RegExp(`\\b${setter}\\s*\\(\\s*true\\s*\\)`);

/**
 * Detects a controlled collection input that is hidden behind an initially
 * false mode without any named or inline control that can open that mode.
 */
export const hasReachableCollectionEntryFlow = (content: string): boolean => {
  const entry = controlledTextEntry.exec(content);
  if (!entry || entry.index === undefined) return true;

  const falseStates = [
    ...content.matchAll(
      /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\s*\(\s*false\s*\)/g,
    ),
  ];
  const callbackPattern =
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;
  const conciseCallbackPattern =
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?!\{)([^;\n]+)/g;
  const mappedRanges = mappedExpressionRanges(content);

  for (const stateMatch of falseStates) {
    const state = stateMatch[1];
    const setter = stateMatch[2];
    const conditional = new RegExp(`\\{\\s*${state}\\s*(\\?|&&)`).exec(content);
    if (!conditional || conditional.index === undefined || conditional.index >= entry.index) {
      continue;
    }

    const expressionEnd = matchingBraceEnd(content, conditional.index);
    const branchEnd =
      conditional[1] === '?'
        ? content.indexOf(':', conditional.index + conditional[0].length)
        : expressionEnd;
    if (branchEnd >= 0 && entry.index >= branchEnd) continue;

    const reachableHandlers = new Set<string>();
    const eventHandlerPattern = /\bon(?:Click|Submit)\s*=\s*\{([\s\S]*?)\}/g;
    for (const event of content.matchAll(eventHandlerPattern)) {
      if (isInsideMappedExpression(event.index ?? 0, mappedRanges)) continue;
      if (setterCall(setter).test(event[1])) return true;
      const reference = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(event[1]);
      if (reference) reachableHandlers.add(reference[1]);
    }

    for (const callback of content.matchAll(callbackPattern)) {
      const name = callback[1] || callback[2] || '';
      if (!reachableHandlers.has(name)) continue;
      if (setterCall(setter).test(functionBody(content, callback.index ?? 0))) return true;
    }
    for (const callback of content.matchAll(conciseCallbackPattern)) {
      if (reachableHandlers.has(callback[1]) && setterCall(setter).test(callback[2])) return true;
    }
    return false;
  }
  return true;
};
