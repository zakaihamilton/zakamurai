import {
  parseBindingPattern,
  parseForHeader,
  parseParameterList,
  registerImportBindings,
  scanBalancedUntil,
} from './BindingParser';
import { tokenizeJs } from './JsTokenizer';
import type { Scope } from './Scope';
import { ScopeManager } from './ScopeManager';
import { buildVariableTargets } from './VariableTargetBuilder';
import type { JsToken, VariableTarget } from './types';

export { tokenizeJs } from './JsTokenizer';

type ArrowScope = {
  hasBlock: boolean;
  depthParen: number;
  depthBrace: number;
  depthBracket: number;
  scope?: Scope;
};

const BLOCK_PREDECESSORS = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'catch',
  'try',
  'else',
  'do',
  ')',
]);

export function resolveVariables(
  code: string | null | undefined,
  filePath: string,
): VariableTarget[] {
  if (!code) return [];
  const tokens = tokenizeJs(code);
  const scopeManager = new ScopeManager();
  const activeArrows: ArrowScope[] = [];
  const tmplExprStack: number[] = [];
  const objectBraceStack: boolean[] = [];

  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let pendingCatchBindingStart = -1;
  let idx = 0;

  function checkAndPopArrows() {
    while (activeArrows.length > 0) {
      const arrow = activeArrows[activeArrows.length - 1];
      if (arrow.hasBlock) break;

      const isEnd =
        (depthParen === arrow.depthParen &&
          depthBrace === arrow.depthBrace &&
          depthBracket === arrow.depthBracket &&
          (tokens[idx]?.value === ',' || tokens[idx]?.value === ';')) ||
        depthParen < arrow.depthParen ||
        depthBrace < arrow.depthBrace ||
        depthBracket < arrow.depthBracket;

      if (isEnd) {
        scopeManager.popScope();
        activeArrows.pop();
      } else {
        break;
      }
    }
  }

  function scanTokenForUsages(tok: JsToken, tIdx: number): void {
    if (tok.type !== 'identifier') return;
    const isMemberProperty =
      tokens[tIdx - 1]?.value === '.' ||
      (tokens[tIdx - 1]?.value === '?' && tokens[tIdx - 2]?.value === '.');
    const isObjectLiteral =
      objectBraceStack.length > 0 && !objectBraceStack[objectBraceStack.length - 1];
    const isObjectKey = isObjectLiteral && tokens[tIdx + 1]?.value === ':';
    if (!isMemberProperty && !isObjectKey) {
      scopeManager.registerUsage(tok);
    }
  }

  function initializerContainsArrow(startIdx: number, endIdx: number): boolean {
    for (let tIdx = startIdx; tIdx < endIdx; tIdx++) {
      if (tokens[tIdx].value === '=>') return true;
    }
    return false;
  }

  while (idx < tokens.length) {
    const token = tokens[idx];

    if (token.value === '(') depthParen++;
    else if (token.value === ')') depthParen--;
    else if (token.value === '[') depthBracket++;
    else if (token.value === ']') depthBracket--;

    checkAndPopArrows();

    if (token.value === '${') {
      tmplExprStack.push(0);
      idx++;
      continue;
    }

    if (token.value === 'import') {
      idx = registerImportBindings(tokens, idx, scopeManager);
      continue;
    }

    if (
      token.type === 'template_close' ||
      (token.value === '}' &&
        tmplExprStack.length > 0 &&
        tmplExprStack[tmplExprStack.length - 1] === 0)
    ) {
      if (tmplExprStack.length > 0) tmplExprStack.pop();
      idx++;
      continue;
    }

    if (token.value === '{') {
      if (tmplExprStack.length > 0) tmplExprStack[tmplExprStack.length - 1]++;
      depthBrace++;
      const prevToken = tokens[idx - 1];
      objectBraceStack.push(!prevToken || BLOCK_PREDECESSORS.has(prevToken.value));
      scopeManager.pushScope(false);
      if (pendingCatchBindingStart >= 0) {
        parseBindingPattern({
          tokens,
          startIdx: pendingCatchBindingStart,
          isBlockScoped: true,
          scopeManager,
          scanTokenForUsages,
        });
        pendingCatchBindingStart = -1;
      }
      idx++;
      continue;
    }

    if (token.value === '}') {
      if (tmplExprStack.length > 0) tmplExprStack[tmplExprStack.length - 1]--;
      depthBrace--;
      objectBraceStack.pop();
      scopeManager.popScope();

      if (
        activeArrows.length > 0 &&
        activeArrows[activeArrows.length - 1].hasBlock &&
        depthBrace <= activeArrows[activeArrows.length - 1].depthBrace
      ) {
        scopeManager.popScope();
        activeArrows.pop();
      }
      idx++;
      continue;
    }

    if (token.value === 'const' || token.value === 'let' || token.value === 'var') {
      const isBlockScoped = token.value !== 'var';
      const initStop = new Set([',', ';']);
      idx++;
      while (idx < tokens.length) {
        idx = parseBindingPattern({
          tokens,
          startIdx: idx,
          isBlockScoped,
          scopeManager,
          scanTokenForUsages,
        });
        if (tokens[idx]?.value === '=') {
          idx++;
          const endIdx = scanBalancedUntil({ tokens, startIdx: idx, stopValues: initStop });
          if (initializerContainsArrow(idx, endIdx)) {
            continue;
          }
          idx = scanBalancedUntil({
            tokens,
            startIdx: idx,
            stopValues: initStop,
            onToken: scanTokenForUsages,
          });
        }
        if (tokens[idx]?.value === ',') idx++;
        else break;
      }
      continue;
    }

    if (token.value === 'function') {
      idx++;
      if (tokens[idx]?.value === '*') idx++;
      if (tokens[idx]?.type === 'identifier') {
        scopeManager.registerVar(tokens[idx].value, tokens[idx], true);
        idx++;
      }
      if (tokens[idx]?.value === '(') {
        scopeManager.pushScope(true);
        idx = parseParameterList({
          tokens,
          startIdx: idx + 1,
          scopeManager,
          scanTokenForUsages,
        });
        if (tokens[idx]?.value === ')') idx++;
      }
      continue;
    }

    if (token.value === 'class') {
      idx++;
      if (tokens[idx]?.type === 'identifier') {
        scopeManager.registerVar(tokens[idx].value, tokens[idx], true);
        idx++;
      }
      continue;
    }

    if (token.value === 'for') {
      idx++;
      if (tokens[idx]?.value === 'await') idx++;
      if (tokens[idx]?.value === '(') {
        depthParen++;
        const { nextIdx, consumedCloseParen } = parseForHeader({
          tokens,
          startIdx: idx + 1,
          scopeManager,
          scanTokenForUsages,
        });
        idx = nextIdx;
        if (consumedCloseParen) depthParen--;
      }
      continue;
    }

    if (token.value === 'catch') {
      idx++;
      if (tokens[idx]?.value === '(') {
        idx++;
        pendingCatchBindingStart = idx;
        idx = scanBalancedUntil({ tokens, startIdx: idx, stopValues: new Set([')']) });
        if (tokens[idx]?.value === ')') idx++;
      }
      continue;
    }

    if (token.value === '=>') {
      const arrowScope = scopeManager.pushScope(true);
      let prevIdx = idx - 1;
      if (prevIdx >= 0) {
        const prevToken = tokens[prevIdx];
        if (prevToken.value === ')') {
          let depth = 1;
          prevIdx--;
          while (prevIdx >= 0 && depth > 0) {
            if (tokens[prevIdx].value === ')') depth++;
            else if (tokens[prevIdx].value === '(') depth--;
            prevIdx--;
          }
          parseParameterList({
            tokens,
            startIdx: prevIdx + 2,
            endIdx: idx - 1,
            scopeManager,
            scanTokenForUsages,
          });
        } else if (prevToken.type === 'identifier') {
          arrowScope.variables.set(prevToken.value, prevToken);
        }
      }

      activeArrows.push({
        scope: arrowScope,
        depthParen,
        depthBrace,
        depthBracket,
        hasBlock: tokens[idx + 1]?.value === '{',
      });
      idx++;
      continue;
    }

    scanTokenForUsages(token, idx);
    idx++;
  }

  return buildVariableTargets(code, filePath, scopeManager.scopes);
}
