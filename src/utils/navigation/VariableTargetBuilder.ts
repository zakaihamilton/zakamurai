import { getLocFromIndex } from './JsSymbolResolver';
import type { Scope } from './Scope';
import type { VariableTarget } from './types';

export function buildVariableTargets(
  code: string,
  filePath: string,
  scopes: Scope[],
): VariableTarget[] {
  const declToUsages = new Map<
    { value: string; start: number; end: number },
    Array<{ value: string; start: number; end: number }>
  >();
  const usageToDecl = new Map<
    { value: string; start: number; end: number },
    { value: string; start: number; end: number }
  >();

  for (const scope of scopes) {
    for (const usageToken of scope.usages) {
      const declToken = scope.find(usageToken.value);
      if (declToken && declToken !== usageToken) {
        usageToDecl.set(usageToken, declToken);
        if (!declToUsages.has(declToken)) {
          declToUsages.set(declToken, []);
        }
        declToUsages.get(declToken)?.push(usageToken);
      }
    }
  }

  const targets: VariableTarget[] = [];
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

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
