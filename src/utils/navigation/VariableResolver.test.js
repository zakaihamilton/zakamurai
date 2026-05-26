import { describe, it, expect } from 'vitest';
import { resolveVariables, tokenizeJs } from './VariableResolver';

describe('VariableResolver', () => {
  describe('tokenizeJs', () => {
    it('tokenizes simple variable declarations', () => {
      const code = 'const x = 42;';
      const tokens = tokenizeJs(code);
      expect(tokens).toHaveLength(5);
      expect(tokens[0]).toEqual({ type: 'keyword', value: 'const', start: 0, end: 5 });
      expect(tokens[1]).toEqual({ type: 'identifier', value: 'x', start: 6, end: 7 });
      expect(tokens[2]).toEqual({ type: 'punctuator', value: '=', start: 8, end: 9 });
      expect(tokens[3]).toEqual({ type: 'number', value: '42', start: 10, end: 12 });
      expect(tokens[4]).toEqual({ type: 'punctuator', value: ';', start: 12, end: 13 });
    });
  });

  describe('resolveVariables', () => {
    it('creates targets for simple variables and their usages', () => {
      const code = 'const x = 10;\nconsole.log(x);';
      const targets = resolveVariables(code, 'test.js');

      // We should have a target for definition (pointing to usage)
      const defTarget = targets.find(t => t.start === 6);
      expect(defTarget).toBeDefined();
      expect(defTarget.name).toBe('x');
      expect(defTarget.targets).toHaveLength(1);
      expect(defTarget.targets[0].loc.line).toBe(2);

      // We should have a target for usage (pointing to definition)
      const useTarget = targets.find(t => t.start === 26);
      expect(useTarget).toBeDefined();
      expect(useTarget.name).toBe('x');
      expect(useTarget.targets).toHaveLength(1);
      expect(useTarget.targets[0].loc.line).toBe(1);
    });

    it('handles function scopes and parameters correctly', () => {
      const code = 'function add(a, b) {\n  return a + b;\n}';
      const targets = resolveVariables(code, 'test.js');

      // 'a' declaration target (should be on line 1)
      const aDef = targets.find(t => t.name === 'a' && t.targets[0].loc.line === 2);
      expect(aDef).toBeDefined();

      // 'a' usage target (should point back to line 1)
      const aUse = targets.find(t => t.name === 'a' && t.targets[0].loc.line === 1);
      expect(aUse).toBeDefined();
    });

    it('handles destructuring declarations and aliases', () => {
      const code = 'const { foo: bar } = obj;\nconsole.log(bar);';
      const targets = resolveVariables(code, 'test.js');

      // bar declaration target
      const barDef = targets.find(t => t.name === 'bar' && t.targets[0].loc.line === 2);
      expect(barDef).toBeDefined();

      // bar usage target
      const barUse = targets.find(t => t.name === 'bar' && t.targets[0].loc.line === 1);
      expect(barUse).toBeDefined();
    });

    it('handles block scoping with let/const correctly', () => {
      const code = 'let x = 1;\n{\n  let x = 2;\n  console.log(x);\n}\nconsole.log(x);';
      const targets = resolveVariables(code, 'test.js');

      // Inner x usage (on line 4) should point to definition on line 3
      const innerUse = targets.find(t => t.targets[0].loc.line === 3);
      expect(innerUse).toBeDefined();

      // Outer x usage (on line 6) should point to definition on line 1
      const outerUse = targets.find(t => t.targets[0].loc.line === 1);
      expect(outerUse).toBeDefined();
    });

    it('handles assignment RHS usages correctly', () => {
      const code = 'const x = 1;\nconst y = x + 2;\nconsole.log(y);';
      const targets = resolveVariables(code, 'test.js');

      // y declaration
      const yDef = targets.find(t => t.name === 'y' && t.targets[0].loc.line === 3);
      expect(yDef).toBeDefined();

      // x usage on line 2 (RHS of y declaration) should point to line 1
      const xUse = targets.find(t => t.name === 'x' && t.start === 23);
      expect(xUse).toBeDefined();
      expect(xUse.targets[0].loc.line).toBe(1);
    });

    it('pops inline arrow function scopes correctly so subsequent outer declarations are resolved', () => {
      const code = 'const list = [1, 2].filter(p => p > 1);\nconst nextVar = 100;\nconsole.log(nextVar);';
      const targets = resolveVariables(code, 'test.js');

      // nextVar declaration on line 2
      const nextDef = targets.find(t => t.name === 'nextVar' && t.targets[0].loc.line === 3);
      expect(nextDef).toBeDefined();

      // nextVar usage on line 3 should point to line 2
      const nextUse = targets.find(t => t.name === 'nextVar' && t.start === 73);
      expect(nextUse).toBeDefined();
      expect(nextUse.targets[0].loc.line).toBe(2);
    });

    it('correctly resolves variables around regex literals', () => {
      const code = [
        'export function resolveFilePath(providedPath, existingPaths) {',
        "  const normalized = providedPath.replace(/^\\.\\//,'').replace(/\\/+/g, '/');",
        '  if (existingPaths.includes(normalized)) return normalized;',
        '}',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      // providedPath definition — should have usages in its list
      const ppDef = targets.find(t => t.name === 'providedPath' && t.targets.length > 0 && t.targets[0].loc.line === 2);
      expect(ppDef).toBeDefined();

      // normalized definition — should have usages on line 3
      const normDef = targets.find(t => t.name === 'normalized' && t.targets.some(u => u.loc.line === 3));
      expect(normDef).toBeDefined();

      // existingPaths definition — should have usages on line 3
      const epDef = targets.find(t => t.name === 'existingPaths' && t.targets.some(u => u.loc.line === 3));
      expect(epDef).toBeDefined();

      // No target name should come from inside the regex pattern
      const falseTarget = targets.find(t => t.name === 'g' || t.name === 's');
      expect(falseTarget).toBeUndefined();
    });

    it('resolves variables declared in for-of loops', () => {
      const code = [
        'function f(items) {',
        '  for (const item of items) {',
        '    console.log(item);',
        '  }',
        '}',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      // 'item' defined on line 2, used on line 3
      const itemDef = targets.find(t => t.name === 'item' && t.targets.some(u => u.loc.line === 3));
      expect(itemDef).toBeDefined();

      // 'items' param defined on line 1, used on line 2 (iterable)
      const itemsDef = targets.find(t => t.name === 'items' && t.targets.some(u => u.loc.line === 2));
      expect(itemsDef).toBeDefined();
    });

    it('resolves variables declared in C-style for loops', () => {
      const code = [
        'function f(arr) {',
        '  let total = 0;',
        '  for (let i = 0; i < arr.length; i++) {',
        '    total += arr[i];',
        '  }',
        '  return total;',
        '}',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      // 'i' defined on line 3, used as condition/update on line 3, and as index on line 4
      const iDef = targets.find(t => t.name === 'i' && t.targets.length > 0);
      expect(iDef).toBeDefined();

      // 'total' defined on line 2, used on lines 4 and 6
      const totalDef = targets.find(t => t.name === 'total' && t.targets.some(u => u.loc.line === 6));
      expect(totalDef).toBeDefined();
    });

    it('does not swallow subsequent variables when a template literal contains ${...}', () => {
      const code = [
        'function f(fileName, existingPaths) {',
        '  const matches = existingPaths.filter((p) => p.endsWith(`/${fileName}`));',
        '  const afterTemplate = 42;',
        '  return afterTemplate;',
        '}',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      // 'matches' defined on line 2, used nowhere — but should be registered
      // 'afterTemplate' defined on line 3, used on line 4
      const afterDef = targets.find(t => t.name === 'afterTemplate' && t.targets.some(u => u.loc.line === 4));
      expect(afterDef).toBeDefined();

      // 'fileName' param used inside the template expression on line 2
      const fileNameDef = targets.find(t => t.name === 'fileName' && t.targets.some(u => u.loc.line === 2));
      expect(fileNameDef).toBeDefined();
    });
  });
});
