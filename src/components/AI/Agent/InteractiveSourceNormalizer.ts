import {
  escapeRegExp,
  extractBalancedBraces,
  findJsxTagEnd,
  findMatchingJsxClose,
  topLevelFunctionSpans,
} from './JsxSourceScanner';

export const normalizeExternalStateCallbacks = (content: string): string => {
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
export const normalizeMappedInteractiveElements = (content: string): string => {
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
  normalizeMappedInteractiveElements(
    normalizeStaleDerivedState(
      normalizeNoOpCollectionSubmit(normalizeHardCodedTurnGuards(content)),
    ),
  );
