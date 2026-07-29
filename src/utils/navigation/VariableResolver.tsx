import { tokenizeJs } from './JsTokenizer';
import { ScopeManager } from './ScopeManager';
import { buildVariableTargets } from './VariableTargetBuilder';
import type { VariableTarget } from './types';

export { tokenizeJs } from './JsTokenizer';

import type { JsToken } from './types';

import type { Scope } from './Scope';

type ArrowScope = {
  hasBlock: boolean;
  depthParen: number;
  depthBrace: number;
  depthBracket: number;
  scope?: Scope;
};

export function resolveVariables(
  code: string | null | undefined,
  filePath: string,
): VariableTarget[] {
  if (!code) return [];
  const tokens = tokenizeJs(code);

  const scopeManager = new ScopeManager();

  const activeArrows: ArrowScope[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  const tmplExprStack: number[] = [];

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

  function parseBindingPattern(
    tokens: JsToken[],
    startIdx: number,
    isBlockScoped: boolean,
  ): number {
    let idx = startIdx;
    if (idx >= tokens.length) return idx;
    const token = tokens[idx];

    if (token.type === 'identifier') {
      scopeManager.registerVar(token.value, token, isBlockScoped);
      return idx + 1;
    }

    if (token.value === '{') {
      idx++;
      while (idx < tokens.length && tokens[idx].value !== '}') {
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
        if (tokens[idx].type === 'identifier') {
          if (tokens[idx + 1]?.value === ':') {
            idx += 2;
            idx = parseBindingPattern(tokens, idx, isBlockScoped);
          } else {
            scopeManager.registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
            idx++;
          }
        } else {
          idx++;
        }

        if (tokens[idx]?.value === '=') {
          idx++;
          let depthParen = 0;
          let depthBrace = 0;
          let depthBracket = 0;
          while (idx < tokens.length) {
            const t = tokens[idx];
            if (t.value === '(') depthParen++;
            else if (t.value === ')') depthParen--;
            else if (t.value === '{' || t.value === '${') depthBrace++;
            else if (t.value === '}' || t.type === 'template_close') depthBrace--;
            else if (t.value === '[') depthBracket++;
            else if (t.value === ']') depthBracket--;

            if (depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
              if (t.value === ',' || t.value === '}') break;
            }
            scanTokenForUsages(t, idx);
            idx++;
          }
        }
      }
      if (tokens[idx]?.value === '}') idx++;
      return idx;
    }

    if (token.value === '[') {
      idx++;
      while (idx < tokens.length && tokens[idx].value !== ']') {
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
        idx = parseBindingPattern(tokens, idx, isBlockScoped);

        if (tokens[idx]?.value === '=') {
          idx++;
          let depthParen = 0;
          let depthBrace = 0;
          let depthBracket = 0;
          while (idx < tokens.length) {
            const t = tokens[idx];
            if (t.value === '(') depthParen++;
            else if (t.value === ')') depthParen--;
            else if (t.value === '{' || t.value === '${') depthBrace++;
            else if (t.value === '}' || t.type === 'template_close') depthBrace--;
            else if (t.value === '[') depthBracket++;
            else if (t.value === ']') depthBracket--;

            if (depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
              if (t.value === ',' || t.value === ']') break;
            }
            scanTokenForUsages(t, idx);
            idx++;
          }
        }
      }
      if (tokens[idx]?.value === ']') idx++;
      return idx;
    }

    return idx + 1;
  }

  function findInitializerBoundary(startIdx: number, stopValues: Set<string>): number {
    let idx = startIdx;
    let dP = 0;
    let dB = 0;
    let dBr = 0;

    while (idx < tokens.length) {
      const t = tokens[idx];
      if (t.value === '(') dP++;
      else if (t.value === ')') dP--;
      else if (t.value === '{' || t.value === '${') dB++;
      else if (t.value === '}' || t.type === 'template_close') dB--;
      else if (t.value === '[') dBr++;
      else if (t.value === ']') dBr--;

      if (dP === 0 && dB === 0 && dBr === 0 && stopValues.has(t.value)) {
        break;
      }
      idx++;
    }

    return idx;
  }

  function initializerContainsArrow(startIdx: number, endIdx: number): boolean {
    for (let tIdx = startIdx; tIdx < endIdx; tIdx++) {
      if (tokens[tIdx].value === '=>') return true;
    }
    return false;
  }

  function scanInitializerForUsages(startIdx: number, stopValues: Set<string>): number {
    const endIdx = findInitializerBoundary(startIdx, stopValues);
    for (let tIdx = startIdx; tIdx < endIdx; tIdx++) {
      scanTokenForUsages(tokens[tIdx], tIdx);
    }
    return endIdx;
  }

  function registerImportBindings(startIdx: number): number {
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

  const blockPredecessors = new Set([
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

  const objectBraceStack: boolean[] = [];
  let pendingCatchBindingStart = -1;

  let idx = 0;
  while (idx < tokens.length) {
    const token = tokens[idx];

    // Maintain depths
    if (token.value === '(') depthParen++;
    else if (token.value === ')') depthParen--;
    else if (token.value === '[') depthBracket++;
    else if (token.value === ']') depthBracket--;

    // Check expression-body arrow function completions
    checkAndPopArrows();

    if (token.value === '${') {
      tmplExprStack.push(0);
      idx++;
      continue;
    }

    if (token.value === 'import') {
      idx = registerImportBindings(idx);
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
      if (tmplExprStack.length > 0) {
        tmplExprStack[tmplExprStack.length - 1]++;
      }
      depthBrace++;
      const prevToken = tokens[idx - 1];
      const isBlock = !prevToken || blockPredecessors.has(prevToken.value);
      objectBraceStack.push(isBlock);

      scopeManager.pushScope(false);
      if (pendingCatchBindingStart >= 0) {
        parseBindingPattern(tokens, pendingCatchBindingStart, true);
        pendingCatchBindingStart = -1;
      }
      idx++;
      continue;
    }

    if (token.value === '}') {
      if (tmplExprStack.length > 0) {
        tmplExprStack[tmplExprStack.length - 1]--;
      }
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
      idx++;
      while (idx < tokens.length) {
        idx = parseBindingPattern(tokens, idx, isBlockScoped);
        if (tokens[idx]?.value === '=') {
          idx++;
          const endIdx = findInitializerBoundary(idx, new Set([',', ';']));
          if (initializerContainsArrow(idx, endIdx)) {
            continue;
          }
          idx = scanInitializerForUsages(idx, new Set([',', ';']));
        }
        if (tokens[idx]?.value === ',') {
          idx++;
        } else {
          break;
        }
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
        idx++;
        scopeManager.pushScope(true);
        while (idx < tokens.length && tokens[idx].value !== ')') {
          if (tokens[idx].value === ',') {
            idx++;
            continue;
          }
          idx = parseBindingPattern(tokens, idx, true);
          if (tokens[idx]?.value === '=') {
            idx++;
            let dP = 0;
            let dB = 0;
            let dBr = 0;
            while (idx < tokens.length) {
              const t = tokens[idx];
              if (t.value === '(') dP++;
              else if (t.value === ')') dP--;
              else if (t.value === '{' || t.value === '${') dB++;
              else if (t.value === '}' || t.type === 'template_close') dB--;
              else if (t.value === '[') dBr++;
              else if (t.value === ']') dBr--;

              if (dP === 0 && dB === 0 && dBr === 0) {
                if (t.value === ',' || t.value === ')') break;
              }
              scanTokenForUsages(t, idx);
              idx++;
            }
          }
        }
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
      // Skip optional 'await' (for-await-of)
      if (tokens[idx]?.value === 'await') idx++;

      if (tokens[idx]?.value === '(') {
        idx++; // consume '('
        depthParen++;

        // Check for `for (const/let/var binding of/in iterable)`
        if (
          tokens[idx]?.type === 'keyword' &&
          (tokens[idx].value === 'const' ||
            tokens[idx].value === 'let' ||
            tokens[idx].value === 'var')
        ) {
          const isBlockScoped = tokens[idx].value !== 'var';
          idx++; // consume const/let/var

          // Parse the binding pattern
          idx = parseBindingPattern(tokens, idx, isBlockScoped);

          if (tokens[idx]?.value === 'of' || tokens[idx]?.value === 'in') {
            // for-of / for-in: scan the iterable expression up to ')'
            idx++; // consume 'of'/'in'
            let dP = 0;
            while (idx < tokens.length) {
              const t = tokens[idx];
              if (t.value === '(') dP++;
              else if (t.value === ')') {
                if (dP === 0) break;
                dP--;
              }
              scanTokenForUsages(t, idx);
              idx++;
            }
            // consume closing ')'
            if (tokens[idx]?.value === ')') {
              idx++;
              depthParen--;
            }
          } else {
            // C-style for with const/let/var init: `for (let i = 0; i < n; i++)`
            // Parse optional initializer
            if (tokens[idx]?.value === '=') {
              idx++; // consume '='
              let dP = 0;
              while (idx < tokens.length) {
                const t = tokens[idx];
                if (t.value === '(') dP++;
                else if (t.value === ')') {
                  if (dP === 0) break;
                  dP--;
                }
                if (dP === 0 && t.value === ';') break;
                scanTokenForUsages(t, idx);
                idx++;
              }
            }
            // Scan condition and update clauses (separated by ';'), until closing ')'
            let dP2 = 0;
            while (idx < tokens.length) {
              const t = tokens[idx];
              if (t.value === '(') dP2++;
              else if (t.value === ')') {
                if (dP2 === 0) break;
                dP2--;
              }
              scanTokenForUsages(t, idx);
              idx++;
            }
            if (tokens[idx]?.value === ')') {
              idx++;
              depthParen--;
            }
          }
        } else {
          // No declaration — may be `for (expr; ...; ...)` or `for (;;)`
          // Scan everything up to the matching ')'
          let dP = 0;
          while (idx < tokens.length) {
            const t = tokens[idx];
            if (t.value === '(') dP++;
            else if (t.value === ')') {
              if (dP === 0) break;
              dP--;
            }
            scanTokenForUsages(t, idx);
            idx++;
          }
          if (tokens[idx]?.value === ')') {
            idx++;
            depthParen--;
          }
        }
      }
      continue;
    }

    if (token.value === 'catch') {
      idx++;
      if (tokens[idx]?.value === '(') {
        idx++;
        pendingCatchBindingStart = idx;
        let parenDepth = 1;
        while (idx < tokens.length && parenDepth > 0) {
          if (tokens[idx].value === '(') parenDepth++;
          else if (tokens[idx].value === ')') parenDepth--;
          if (parenDepth > 0) idx++;
        }
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
          let pIdx = prevIdx + 2;
          while (pIdx < idx - 1) {
            pIdx = parseBindingPattern(tokens, pIdx, true);
            if (tokens[pIdx]?.value === '=') {
              pIdx++;
              let dP = 0;
              let dB = 0;
              let dBr = 0;
              while (pIdx < idx - 1) {
                const t = tokens[pIdx];
                if (t.value === '(') dP++;
                else if (t.value === ')') dP--;
                else if (t.value === '{' || t.value === '${') dB++;
                else if (t.value === '}' || t.type === 'template_close') dB--;
                else if (t.value === '[') dBr++;
                else if (t.value === ']') dBr--;

                if (dP === 0 && dB === 0 && dBr === 0) {
                  if (t.value === ',' || t.value === ')') break;
                }
                scanTokenForUsages(t, pIdx);
                pIdx++;
              }
            }
            if (tokens[pIdx]?.value === ',') pIdx++;
            else pIdx++;
          }
        } else if (prevToken.type === 'identifier') {
          arrowScope.variables.set(prevToken.value, prevToken);
        }
      }

      // Record this arrow function scope to pop it when its expression body completes
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
