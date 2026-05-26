import { getLocFromIndex } from './JsSymbolResolver';

export function tokenizeJs(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;

  while (i < len) {
    const char = code[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Single-line comment
    if (char === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < len && code[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line comment
    if (char === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // String literal
    if (char === '"' || char === "'") {
      const quote = char;
      const start = i;
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
        } else if (code[i] === quote) {
          i++;
          break;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'string', value: code.substring(start, i), start, end: i });
      continue;
    }

    // Template literal
    if (char === '`') {
      const start = i;
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
        } else if (code[i] === '`') {
          i++;
          break;
        } else if (code[i] === '$' && code[i + 1] === '{') {
          break;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'template_text', value: code.substring(start, i), start, end: i });
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_$]/.test(char)) {
      const start = i;
      i++;
      while (i < len && /[a-zA-Z0-9_$]/.test(code[i])) {
        i++;
      }
      const value = code.substring(start, i);
      const keywords = new Set([
        'const', 'let', 'var', 'function', 'class', 'try', 'catch',
        'import', 'export', 'default', 'return', 'if', 'else', 'for',
        'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
        'this', 'typeof', 'void', 'delete', 'in', 'instanceof', 'async', 'await'
      ]);
      tokens.push({
        type: keywords.has(value) ? 'keyword' : 'identifier',
        value,
        start,
        end: i
      });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const start = i;
      i++;
      while (i < len && /[0-9a-fA-F\.xX]/.test(code[i])) {
        i++;
      }
      tokens.push({ type: 'number', value: code.substring(start, i), start, end: i });
      continue;
    }

    // Punctuators
    const punctuators = [
      '=>', '${', '===', '!==', '==', '!=', '>=', '<=', '++', '--',
      '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':',
      '{', '}', '(', ')', '[', ']', '.', ',', ';', '='
    ];
    let matched = false;
    for (const p of punctuators) {
      if (code.substring(i, i + p.length) === p) {
        tokens.push({ type: 'punctuator', value: p, start: i, end: i + p.length });
        i += p.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: 'punctuator', value: char, start: i, end: i + 1 });
      i++;
    }
  }

  return tokens;
}

class Scope {
  constructor(parent = null, isFunctionScope = false) {
    this.parent = parent;
    this.isFunctionScope = isFunctionScope;
    this.variables = new Map();
    this.usages = [];
  }

  find(name) {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.find(name);
    }
    return null;
  }
}

export function resolveVariables(code, filePath) {
  if (!code) return [];
  const tokens = tokenizeJs(code);

  const rootScope = new Scope(null, true);
  let currentScope = rootScope;
  const scopes = [rootScope];

  function pushScope(isFunctionScope = false) {
    const scope = new Scope(currentScope, isFunctionScope);
    scopes.push(scope);
    currentScope = scope;
    return scope;
  }

  function popScope() {
    if (currentScope.parent) {
      currentScope = currentScope.parent;
    }
  }

  function getNearestFunctionScope() {
    let s = currentScope;
    while (s) {
      if (s.isFunctionScope) return s;
      s = s.parent;
    }
    return rootScope;
  }

  function registerVar(name, token, isBlockScoped) {
    const scope = isBlockScoped ? currentScope : getNearestFunctionScope();
    if (!scope.variables.has(name)) {
      scope.variables.set(name, token);
    }
  }

  const activeArrows = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  function checkAndPopArrows() {
    while (activeArrows.length > 0) {
      const arrow = activeArrows[activeArrows.length - 1];
      if (arrow.hasBlock) break;

      const isEnd =
        (depthParen === arrow.depthParen && depthBrace === arrow.depthBrace && depthBracket === arrow.depthBracket && (tokens[idx]?.value === ',' || tokens[idx]?.value === ';')) ||
        depthParen < arrow.depthParen ||
        depthBrace < arrow.depthBrace ||
        depthBracket < arrow.depthBracket;

      if (isEnd) {
        popScope();
        activeArrows.pop();
      } else {
        break;
      }
    }
  }

  function scanTokenForUsages(tok, tIdx) {
    if (tok.type !== 'identifier') return;
    const isMemberProperty = tokens[tIdx - 1]?.value === '.' || (tokens[tIdx - 1]?.value === '?' && tokens[tIdx - 2]?.value === '.');
    const isObjectLiteral = objectBraceStack.length > 0 && !objectBraceStack[objectBraceStack.length - 1];
    const isObjectKey = isObjectLiteral && tokens[tIdx + 1]?.value === ':';

    if (!isMemberProperty && !isObjectKey) {
      currentScope.usages.push(tok);
    }
  }

  function parseBindingPattern(tokens, startIdx, isBlockScoped) {
    let idx = startIdx;
    if (idx >= tokens.length) return idx;
    const token = tokens[idx];

    if (token.type === 'identifier') {
      registerVar(token.value, token, isBlockScoped);
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
            registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
            idx++;
          }
          continue;
        }
        if (tokens[idx].type === 'identifier') {
          if (tokens[idx + 1]?.value === ':') {
            idx += 2;
            idx = parseBindingPattern(tokens, idx, isBlockScoped);
          } else {
            registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
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
            else if (t.value === '{') depthBrace++;
            else if (t.value === '}') depthBrace--;
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
            registerVar(tokens[idx].value, tokens[idx], isBlockScoped);
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
            else if (t.value === '{') depthBrace++;
            else if (t.value === '}') depthBrace--;
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

  const blockPredecessors = new Set([
    'const', 'let', 'var', 'function', 'class', 'catch', 'try', 'else', 'do', ')'
  ]);

  const objectBraceStack = [];

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

    if (token.value === '{') {
      depthBrace++;
      const prevToken = tokens[idx - 1];
      const isBlock = !prevToken || blockPredecessors.has(prevToken.value);
      objectBraceStack.push(isBlock);

      pushScope(false);
      idx++;
      continue;
    }

    if (token.value === '}') {
      depthBrace--;
      objectBraceStack.pop();
      popScope();

      if (activeArrows.length > 0 && activeArrows[activeArrows.length - 1].hasBlock) {
        popScope();
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
          let dP = 0;
          let dB = 0;
          let dBr = 0;
          while (idx < tokens.length) {
            const t = tokens[idx];
            if (t.value === '(') dP++;
            else if (t.value === ')') dP--;
            else if (t.value === '{') dB++;
            else if (t.value === '}') dB--;
            else if (t.value === '[') dBr++;
            else if (t.value === ']') dBr--;

            if (dP === 0 && dB === 0 && dBr === 0) {
              if (t.value === ',' || t.value === ';') break;
            }
            scanTokenForUsages(t, idx);
            idx++;
          }
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
        registerVar(tokens[idx].value, tokens[idx], true);
        idx++;
      }
      if (tokens[idx]?.value === '(') {
        idx++;
        const funcScope = pushScope(true);
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
              else if (t.value === '{') dB++;
              else if (t.value === '}') dB--;
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
        registerVar(tokens[idx].value, tokens[idx], true);
        idx++;
      }
      continue;
    }

    if (token.value === 'catch') {
      idx++;
      if (tokens[idx]?.value === '(') {
        idx++;
        const catchScope = pushScope(false);
        idx = parseBindingPattern(tokens, idx, true);
        if (tokens[idx]?.value === ')') idx++;
      }
      continue;
    }

    if (token.value === '=>') {
      const arrowScope = pushScope(true);
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
                else if (t.value === '{') dB++;
                else if (t.value === '}') dB--;
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
            else if (pIdx === pIdx) pIdx++;
          }
        } else if (prevToken.type === 'identifier') {
          arrowScope.variables.set(prevToken.value, prevToken);
        }
      }

      // Record this arrow function scope to pop it when its expression body completes
      activeArrows.push({
        scope: arrowScope,
        depthParen: token.value === ')' ? depthParen + 1 : depthParen,
        depthBrace,
        depthBracket,
        hasBlock: tokens[idx + 1]?.value === '{'
      });

      idx++;
      continue;
    }

    scanTokenForUsages(token, idx);
    idx++;
  }

  const declToUsages = new Map();
  const usageToDecl = new Map();

  for (const scope of scopes) {
    for (const usageToken of scope.usages) {
      const declToken = scope.find(usageToken.value);
      if (declToken && declToken !== usageToken) {
        usageToDecl.set(usageToken, declToken);
        if (!declToUsages.has(declToken)) {
          declToUsages.set(declToken, []);
        }
        declToUsages.get(declToken).push(usageToken);
      }
    }
  }

  const targets = [];
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

  // 1. Definition targets (clicking definition list usages)
  for (const [declToken, usages] of declToUsages.entries()) {
    targets.push({
      type: 'variable',
      name: declToken.value,
      start: declToken.start,
      end: declToken.end,
      targets: usages.map((use) => ({
        filePath,
        fileName,
        loc: getLocFromIndex(code, use.start),
      })),
    });
  }

  // 2. Usage targets (clicking usage jumps to definition)
  for (const [usageToken, declToken] of usageToDecl.entries()) {
    targets.push({
      type: 'variable',
      name: usageToken.value,
      start: usageToken.start,
      end: usageToken.end,
      targets: [
        {
          filePath,
          fileName,
          loc: getLocFromIndex(code, declToken.start),
        },
      ],
    });
  }

  return targets;
}
