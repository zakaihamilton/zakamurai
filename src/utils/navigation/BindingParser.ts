import type { ScopeManager } from './ScopeManager';
import type { JsToken } from './types';

export type UsageScanner = (token: JsToken, tokenIndex: number) => void;

export function scanBalancedUntil({
  tokens,
  startIdx,
  endIdx = tokens.length,
  stopValues,
  onToken,
}: {
  tokens: JsToken[];
  startIdx: number;
  endIdx?: number;
  stopValues: Set<string>;
  onToken?: UsageScanner;
}): number {
  let idx = startIdx;
  let dP = 0;
  let dB = 0;
  let dBr = 0;

  while (idx < endIdx) {
    const t = tokens[idx];
    if (dP === 0 && dB === 0 && dBr === 0 && stopValues.has(t.value)) {
      break;
    }

    if (t.value === '(') dP++;
    else if (t.value === ')') dP--;
    else if (t.value === '{' || t.value === '${') dB++;
    else if (t.value === '}' || t.type === 'template_close') dB--;
    else if (t.value === '[') dBr++;
    else if (t.value === ']') dBr--;

    onToken?.(t, idx);
    idx++;
  }

  return idx;
}

export function parseBindingPattern({
  tokens,
  startIdx,
  isBlockScoped,
  scopeManager,
  scanTokenForUsages,
}: {
  tokens: JsToken[];
  startIdx: number;
  isBlockScoped: boolean;
  scopeManager: ScopeManager;
  scanTokenForUsages: UsageScanner;
}): number {
  let idx = startIdx;
  if (idx >= tokens.length) return idx;
  const token = tokens[idx];

  if (token.type === 'identifier') {
    scopeManager.registerVar(token.value, token, isBlockScoped);
    return idx + 1;
  }

  if (token.value === '{' || token.value === '[') {
    const closeDelimiter = token.value === '{' ? '}' : ']';
    const isObjectPattern = token.value === '{';
    const defaultStopValues = new Set([',', closeDelimiter]);
    idx++;

    while (idx < tokens.length && tokens[idx].value !== closeDelimiter) {
      if (tokens[idx].value === ',') {
        idx++;
        continue;
      }
      if (tokens[idx].value === '...') {
        idx++;
        if (tokens[idx]?.type === 'identifier') {
          scopeManager.registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
          idx++;
        }
        continue;
      }

      if (isObjectPattern) {
        if (tokens[idx].type === 'identifier') {
          if (tokens[idx + 1]?.value === ':') {
            idx += 2;
            idx = parseBindingPattern({
              tokens,
              startIdx: idx,
              isBlockScoped,
              scopeManager,
              scanTokenForUsages,
            });
          } else {
            scopeManager.registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
            idx++;
          }
        } else {
          idx++;
        }
      } else {
        idx = parseBindingPattern({
          tokens,
          startIdx: idx,
          isBlockScoped,
          scopeManager,
          scanTokenForUsages,
        });
      }

      if (tokens[idx]?.value === '=') {
        idx = scanBalancedUntil({
          tokens,
          startIdx: idx + 1,
          stopValues: defaultStopValues,
          onToken: scanTokenForUsages,
        });
      }
    }

    if (tokens[idx]?.value === closeDelimiter) idx++;
    return idx;
  }

  return idx + 1;
}

export function parseParameterList({
  tokens,
  startIdx,
  endIdx = tokens.length,
  scopeManager,
  scanTokenForUsages,
}: {
  tokens: JsToken[];
  startIdx: number;
  endIdx?: number;
  scopeManager: ScopeManager;
  scanTokenForUsages: UsageScanner;
}): number {
  let idx = startIdx;
  const stopValues = new Set([',', ')']);

  while (idx < endIdx && tokens[idx].value !== ')') {
    if (tokens[idx].value === ',') {
      idx++;
      continue;
    }
    idx = parseBindingPattern({
      tokens,
      startIdx: idx,
      isBlockScoped: true,
      scopeManager,
      scanTokenForUsages,
    });
    if (tokens[idx]?.value === '=') {
      idx = scanBalancedUntil({
        tokens,
        startIdx: idx + 1,
        endIdx,
        stopValues,
        onToken: scanTokenForUsages,
      });
    }
  }

  return idx;
}

export function registerImportBindings(
  tokens: JsToken[],
  startIdx: number,
  scopeManager: ScopeManager,
): number {
  let importIdx = startIdx + 1;

  if (tokens[importIdx]?.type === 'string') {
    return importIdx + 1;
  }

  if (tokens[importIdx]?.type === 'identifier') {
    scopeManager.registerVar(tokens[importIdx].value, tokens[importIdx], true);
    importIdx++;
    if (tokens[importIdx]?.value === ',') importIdx++;
  }

  if (tokens[importIdx]?.value === '*') {
    importIdx++;
    if (tokens[importIdx]?.value === 'as') importIdx++;
    if (tokens[importIdx]?.type === 'identifier') {
      scopeManager.registerVar(tokens[importIdx].value, tokens[importIdx], true);
      importIdx++;
    }
  }

  if (tokens[importIdx]?.value === '{') {
    importIdx++;
    while (importIdx < tokens.length && tokens[importIdx].value !== '}') {
      if (tokens[importIdx].type === 'identifier') {
        const bindingToken =
          tokens[importIdx + 1]?.value === 'as' && tokens[importIdx + 2]?.type === 'identifier'
            ? tokens[importIdx + 2]
            : tokens[importIdx];
        scopeManager.registerVar(bindingToken.value, bindingToken, true);
        importIdx = bindingToken === tokens[importIdx] ? importIdx + 1 : importIdx + 3;
        continue;
      }
      importIdx++;
    }
    if (tokens[importIdx]?.value === '}') importIdx++;
  }

  while (importIdx < tokens.length && tokens[importIdx].value !== ';') {
    importIdx++;
  }
  return importIdx;
}

export function parseForHeader({
  tokens,
  startIdx,
  scopeManager,
  scanTokenForUsages,
}: {
  tokens: JsToken[];
  startIdx: number;
  scopeManager: ScopeManager;
  scanTokenForUsages: UsageScanner;
}): { nextIdx: number; consumedCloseParen: boolean } {
  let idx = startIdx;
  const closeParenStop = new Set([')']);
  const initStop = new Set([';', ')']);

  if (
    tokens[idx]?.type === 'keyword' &&
    (tokens[idx].value === 'const' || tokens[idx].value === 'let' || tokens[idx].value === 'var')
  ) {
    const isBlockScoped = tokens[idx].value !== 'var';
    idx = parseBindingPattern({
      tokens,
      startIdx: idx + 1,
      isBlockScoped,
      scopeManager,
      scanTokenForUsages,
    });

    if (tokens[idx]?.value === 'of' || tokens[idx]?.value === 'in') {
      idx = scanBalancedUntil({
        tokens,
        startIdx: idx + 1,
        stopValues: closeParenStop,
        onToken: scanTokenForUsages,
      });
    } else {
      if (tokens[idx]?.value === '=') {
        idx = scanBalancedUntil({
          tokens,
          startIdx: idx + 1,
          stopValues: initStop,
          onToken: scanTokenForUsages,
        });
      }
      idx = scanBalancedUntil({
        tokens,
        startIdx: idx,
        stopValues: closeParenStop,
        onToken: scanTokenForUsages,
      });
    }
  } else {
    idx = scanBalancedUntil({
      tokens,
      startIdx: idx,
      stopValues: closeParenStop,
      onToken: scanTokenForUsages,
    });
  }

  if (tokens[idx]?.value === ')') {
    return { nextIdx: idx + 1, consumedCloseParen: true };
  }
  return { nextIdx: idx, consumedCloseParen: false };
}
