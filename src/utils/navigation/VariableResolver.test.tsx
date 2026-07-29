import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
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
    it('returns empty array for empty or missing code', () => {
      expect(resolveVariables('', 'test.js')).toEqual([]);
      expect(resolveVariables(null, 'test.js')).toEqual([]);
    });

    it('creates targets for simple variables and their usages', () => {
      const code = 'const x = 10;\nconsole.log(x);';
      const targets = resolveVariables(code, 'test.js');

      // We should have a target for definition (pointing to usage)
      const defTarget = targets.find((t) => t.start === 6);
      expect(defTarget).toBeDefined();
      expect(defTarget!.name).toBe('x');
      expect(defTarget!.targets).toHaveLength(1);
      expect(defTarget!.targets[0].loc.line).toBe(2);

      // We should have a target for usage (pointing to definition)
      const useTarget = targets.find((t) => t.start === 26);
      expect(useTarget).toBeDefined();
      expect(useTarget!.name).toBe('x');
      expect(useTarget!.targets).toHaveLength(1);
      expect(useTarget!.targets[0].loc.line).toBe(1);
    });

    it('handles function scopes and parameters correctly', () => {
      const code = 'function add(a, b) {\n  return a + b;\n}';
      const targets = resolveVariables(code, 'test.js');

      // 'a' declaration target (should be on line 1)
      const aDef = targets.find((t) => t.name === 'a' && t.targets[0].loc.line === 2);
      expect(aDef).toBeDefined();

      // 'a' usage target (should point back to line 1)
      const aUse = targets.find((t) => t.name === 'a' && t.targets[0].loc.line === 1);
      expect(aUse).toBeDefined();
    });

    it('handles destructuring declarations and aliases', () => {
      const code = 'const { foo: bar } = obj;\nconsole.log(bar);';
      const targets = resolveVariables(code, 'test.js');

      // bar declaration target
      const barDef = targets.find((t) => t.name === 'bar' && t.targets[0].loc.line === 2);
      expect(barDef).toBeDefined();

      // bar usage target
      const barUse = targets.find((t) => t.name === 'bar' && t.targets[0].loc.line === 1);
      expect(barUse).toBeDefined();
    });

    it('handles block scoping with let/const correctly', () => {
      const code = 'let x = 1;\n{\n  let x = 2;\n  console.log(x);\n}\nconsole.log(x);';
      const targets = resolveVariables(code, 'test.js');

      // Inner x usage (on line 4) should point to definition on line 3
      const innerUse = targets.find((t) => t.targets[0].loc.line === 3);
      expect(innerUse).toBeDefined();

      // Outer x usage (on line 6) should point to definition on line 1
      const outerUse = targets.find((t) => t.targets[0].loc.line === 1);
      expect(outerUse).toBeDefined();
    });

    it('handles assignment RHS usages correctly', () => {
      const code = 'const x = 1;\nconst y = x + 2;\nconsole.log(y);';
      const targets = resolveVariables(code, 'test.js');

      // y declaration
      const yDef = targets.find((t) => t.name === 'y' && t.targets[0].loc.line === 3);
      expect(yDef).toBeDefined();

      // x usage on line 2 (RHS of y declaration) should point to line 1
      const xUse = targets.find((t) => t.name === 'x' && t.start === 23);
      expect(xUse).toBeDefined();
      expect(xUse!.targets[0].loc.line).toBe(1);
    });

    it('pops inline arrow function scopes correctly so subsequent outer declarations are resolved', () => {
      const code =
        'const list = [1, 2].filter(p => p > 1);\nconst nextVar = 100;\nconsole.log(nextVar);';
      const targets = resolveVariables(code, 'test.js');

      // nextVar declaration on line 2
      const nextDef = targets.find((t) => t.name === 'nextVar' && t.targets[0].loc.line === 3);
      expect(nextDef).toBeDefined();

      // nextVar usage on line 3 should point to line 2
      const nextUse = targets.find((t) => t.name === 'nextVar' && t.start === 73);
      expect(nextUse).toBeDefined();
      expect(nextUse!.targets[0].loc.line).toBe(2);
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
      const ppDef = targets.find(
        (t) => t.name === 'providedPath' && t.targets.length > 0 && t.targets[0].loc.line === 2,
      );
      expect(ppDef).toBeDefined();

      // normalized definition — should have usages on line 3
      const normDef = targets.find(
        (t) => t.name === 'normalized' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(normDef).toBeDefined();

      // existingPaths definition — should have usages on line 3
      const epDef = targets.find(
        (t) => t.name === 'existingPaths' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(epDef).toBeDefined();

      // No target name should come from inside the regex pattern
      const falseTarget = targets.find((t) => t.name === 'g' || t.name === 's');
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
      const itemDef = targets.find(
        (t) => t.name === 'item' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(itemDef).toBeDefined();

      // 'items' param defined on line 1, used on line 2 (iterable)
      const itemsDef = targets.find(
        (t) => t.name === 'items' && t.targets.some((u) => u.loc.line === 2),
      );
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
      const iDef = targets.find((t) => t.name === 'i' && t.targets.length > 0);
      expect(iDef).toBeDefined();

      // 'total' defined on line 2, used on lines 4 and 6
      const totalDef = targets.find(
        (t) => t.name === 'total' && t.targets.some((u) => u.loc.line === 6),
      );
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
      const afterDef = targets.find(
        (t) => t.name === 'afterTemplate' && t.targets.some((u) => u.loc.line === 4),
      );
      expect(afterDef).toBeDefined();

      // 'fileName' param used inside the template expression on line 2
      const fileNameDef = targets.find(
        (t) => t.name === 'fileName' && t.targets.some((u) => u.loc.line === 2),
      );
      expect(fileNameDef).toBeDefined();
    });

    it('resolves imported bindings when they are used later in the file', () => {
      const code = [
        "import { CreateThing, model as selectedModel } from './models';",
        'const value = selectedModel.id;',
        'CreateThing(value);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const importedAliasUse = targets.find((t) => t.name === 'selectedModel' && t.start === 78);
      expect(importedAliasUse).toBeDefined();
      expect(importedAliasUse!.targets[0].loc.line).toBe(1);

      const importedFnUse = targets.find((t) => t.name === 'CreateThing' && t.start === 96);
      expect(importedFnUse).toBeDefined();
      expect(importedFnUse!.targets[0].loc.line).toBe(1);
    });

    it('walks arrow function initializers so params and body locals get links', () => {
      const code = [
        'const outer = 1;',
        'export const run = async (input, onUpdate = null, options = {}) => {',
        '  const selected = input || outer;',
        '  if (onUpdate) onUpdate(selected);',
        '  try {',
        '    const result = await makeThing(options.model);',
        '    return result.value;',
        '  } catch (error) {',
        '    throw new Error(error.message || error);',
        '  }',
        '};',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const inputDef = targets.find(
        (t) => t.name === 'input' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(inputDef).toBeDefined();

      const onUpdateDef = targets.find(
        (t) => t.name === 'onUpdate' && t.targets.some((u) => u.loc.line === 4),
      );
      expect(onUpdateDef).toBeDefined();

      const optionsDef = targets.find(
        (t) => t.name === 'options' && t.targets.some((u) => u.loc.line === 6),
      );
      expect(optionsDef).toBeDefined();

      const selectedDef = targets.find(
        (t) => t.name === 'selected' && t.targets.some((u) => u.loc.line === 4),
      );
      expect(selectedDef).toBeDefined();

      const resultDef = targets.find(
        (t) => t.name === 'result' && t.targets.some((u) => u.loc.line === 7),
      );
      expect(resultDef).toBeDefined();

      const errorDef = targets.find(
        (t) => t.name === 'error' && t.targets.some((u) => u.loc.line === 9),
      );
      expect(errorDef).toBeDefined();
    });

    it('resolves shorthand object properties and spread identifiers in call arguments', () => {
      const code = [
        'const messages = [];',
        'const generationOptions = {};',
        'const reply = await engine.chat.completions.create({',
        '  messages,',
        '  ...generationOptions,',
        '});',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const messagesUse = targets.find((t) => t.name === 'messages' && t.start === 106);
      expect(messagesUse).toBeDefined();
      expect(messagesUse!.targets[0].loc.line).toBe(1);

      const generationOptionsUse = targets.find(
        (t) => t.name === 'generationOptions' && t.start === 121,
      );
      expect(generationOptionsUse).toBeDefined();
      expect(generationOptionsUse!.targets[0].loc.line).toBe(2);
    });

    it('resolves object argument usages inside exported async arrow function blocks', () => {
      const code = [
        "export const askWebLLM = async (prompt, systemPrompt = '', onUpdate = null, options = {}) => {",
        '  try {',
        '    const engine = await getEngine(options.model, onUpdate, options);',
        '    const messages = [',
        "      { role: 'system', content: systemPrompt },",
        "      { role: 'user', content: prompt },",
        '    ];',
        '    const generationOptions = {',
        '      temperature: options.temperature ?? 0.7,',
        '    };',
        '    if (onUpdate) {',
        '      const chunks = await engine.chat.completions.create({',
        '        messages,',
        '        ...generationOptions,',
        '        stream: true,',
        '      });',
        '      return chunks;',
        '    }',
        '  } catch (error) {',
        '    throw error;',
        '  }',
        '};',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');
      const messagesUseIndex = code.indexOf('messages,');
      const generationOptionsUseIndex = code.indexOf('generationOptions,');

      const messagesUse = targets.find(
        (t) => t.name === 'messages' && t.start === messagesUseIndex,
      );
      expect(messagesUse).toBeDefined();
      expect(messagesUse!.targets[0].loc.line).toBe(4);

      const generationOptionsUse = targets.find(
        (t) => t.name === 'generationOptions' && t.start === generationOptionsUseIndex,
      );
      expect(generationOptionsUse).toBeDefined();
      expect(generationOptionsUse!.targets[0].loc.line).toBe(8);
    });

    it('does not leak catch parameter scope into later module declarations', () => {
      const code = [
        'export const deleteCached = async () => {',
        '  await interruptWebLLM();',
        '};',
        'export const askWebLLM = async () => {',
        '  try {',
        '    console.log(1);',
        '  } catch (error) {',
        '    throw error;',
        '  }',
        '};',
        'export const interruptWebLLM = async () => {};',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');
      const useIndex = code.indexOf('interruptWebLLM()');
      const useTarget = targets.find((t) => t.name === 'interruptWebLLM' && t.start === useIndex);
      expect(useTarget).toBeDefined();
      expect(useTarget!.targets[0].loc.line).toBe(11);
    });

    it('resolves forward references to exported const arrow functions', () => {
      const code = [
        'export const deleteCached = async () => {',
        '  await interruptWebLLM();',
        '};',
        'export const interruptWebLLM = async () => {};',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');
      const useIndex = code.indexOf('interruptWebLLM()');
      const useTarget = targets.find((t) => t.name === 'interruptWebLLM' && t.start === useIndex);
      expect(useTarget).toBeDefined();
      expect(useTarget!.targets[0].loc.line).toBe(4);
    });

    it('resolves interruptWebLLM forward reference in WebLLMAPI', () => {
      const code = fs.readFileSync('src/components/AI/WebLLMAPI.js', 'utf8');
      const targets = resolveVariables(code, 'src/components/AI/WebLLMAPI.js');
      const useIndex = code.indexOf('interruptWebLLM()');
      const useTarget = targets.find((t) => t.name === 'interruptWebLLM' && t.start === useIndex);
      expect(useTarget).toBeDefined();
      const declLine = code
        .slice(0, code.search(/export const interruptWebLLM\s*=\s*async/))
        .split('\n').length;
      expect(useTarget!.targets[0].loc.line).toBe(declLine);
    });

    it('resolves object argument usages in WebLLMAPI', () => {
      const code = fs.readFileSync('src/components/AI/WebLLMAPI.js', 'utf8');
      const targets = resolveVariables(code, 'src/components/AI/WebLLMAPI.js');
      const messagesUseIndex = code.indexOf('messages,', code.indexOf('completions.create'));
      const generationOptionsUseIndex = code.indexOf(
        'generationOptions,',
        code.indexOf('completions.create'),
      );
      const messagesUse = targets.find(
        (t) => t.name === 'messages' && t.start === messagesUseIndex,
      );
      expect(messagesUse).toBeDefined();
      const messagesDeclLine = code.slice(0, code.search(/const messages\s*=/)).split('\n').length;
      expect(messagesUse!.targets[0].loc.line).toBe(messagesDeclLine);

      const generationOptionsUse = targets.find(
        (t) => t.name === 'generationOptions' && t.start === generationOptionsUseIndex,
      );
      expect(generationOptionsUse).toBeDefined();
      const generationOptionsDeclLine = code
        .slice(0, code.search(/const generationOptions\s*=/))
        .split('\n').length;
      expect(generationOptionsUse!.targets[0].loc.line).toBe(generationOptionsDeclLine);
    });

    it('registers rest parameters in destructuring and function params', () => {
      const code = [
        'function collect(first, ...rest) {',
        '  console.log(rest);',
        '}',
        'const { head, ...tail } = list;',
        'console.log(tail);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const restDef = targets.find(
        (t) => t.name === 'rest' && t.targets.some((u) => u.loc.line === 2),
      );
      expect(restDef).toBeDefined();

      const tailDef = targets.find(
        (t) => t.name === 'tail' && t.targets.some((u) => u.loc.line === 5),
      );
      expect(tailDef).toBeDefined();
    });

    it('registers default parameter bindings and initializer usages', () => {
      const code = [
        'const fallback = 1;',
        'function greet(name = fallback) {',
        '  return name;',
        '}',
        'console.log(greet());',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const fallbackUse = targets.find(
        (t) => t.name === 'fallback' && t.start === code.indexOf('fallback)'),
      );
      expect(fallbackUse).toBeDefined();
      expect(fallbackUse!.targets[0].loc.line).toBe(1);

      const nameDef = targets.find(
        (t) => t.name === 'name' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(nameDef).toBeDefined();
    });

    it('registers namespace import bindings from import * as', () => {
      const code = ["import * as models from './models';", 'const id = models.selected.id;'].join(
        '\n',
      );
      const targets = resolveVariables(code, 'test.js');

      const modelsUse = targets.find(
        (t) => t.name === 'models' && t.start === code.indexOf('models.selected'),
      );
      expect(modelsUse).toBeDefined();
      expect(modelsUse!.targets[0].loc.line).toBe(1);
    });

    it('registers trailing-comma named import bindings', () => {
      const code = ["import { Alpha, Beta, } from './symbols';", 'Alpha(Beta);'].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const betaUse = targets.find((t) => t.name === 'Beta' && t.start === code.indexOf('Beta)'));
      expect(betaUse).toBeDefined();
      expect(betaUse!.targets[0].loc.line).toBe(1);
    });

    it('registers class declarations', () => {
      const code = [
        'class Widget {',
        '  render() {',
        '    return this;',
        '  }',
        '}',
        'const w = new Widget();',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const widgetDef = targets.find(
        (t) => t.name === 'Widget' && t.targets.some((u) => u.loc.line === 6),
      );
      expect(widgetDef).toBeDefined();
    });

    it('resolves variables inside nested template literals', () => {
      const code = [
        'const outer = 1;',
        'const label = `a-${`inner-${outer}`}-b`;',
        'console.log(label);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const outerUse = targets.find(
        (t) => t.name === 'outer' && t.targets.some((u) => u.loc.line === 2),
      );
      expect(outerUse).toBeDefined();

      const labelDef = targets.find(
        (t) => t.name === 'label' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(labelDef).toBeDefined();
    });

    it('registers destructuring defaults and scans default initializer usages', () => {
      const code = [
        'const fallback = 10;',
        'const { value = fallback, other = 2 } = input;',
        'console.log(value, other);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const fallbackUse = targets.find(
        (t) => t.name === 'fallback' && t.start === code.indexOf('fallback,'),
      );
      expect(fallbackUse).toBeDefined();
      expect(fallbackUse!.targets[0].loc.line).toBe(1);

      const valueDef = targets.find(
        (t) => t.name === 'value' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(valueDef).toBeDefined();
    });

    it('handles for-in loops with var, let, and const bindings', () => {
      const code = [
        'const keys = [];',
        'for (var a in obj) keys.push(a);',
        'for (let b in obj) keys.push(b);',
        'for (const c in obj) keys.push(c);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const keysDef = targets.find(
        (t) => t.name === 'keys' && t.targets.some((u) => u.loc.line === 4),
      );
      expect(keysDef).toBeDefined();

      const bDef = targets.find((t) => t.name === 'b' && t.targets.some((u) => u.loc.line === 3));
      expect(bDef).toBeDefined();
    });

    it('pops nested parenthesized arrow scopes at matching depth', () => {
      const code = [
        'const outer = 1;',
        'const run = ((value) => ((inner) => inner + value)(2));',
        'console.log(outer, run);',
      ].join('\n');
      const targets = resolveVariables(code, 'test.js');

      const valueUse = targets.find(
        (t) => t.name === 'value' && t.targets.some((u) => u.loc.line === 2),
      );
      expect(valueUse).toBeDefined();

      const outerUse = targets.find(
        (t) => t.name === 'outer' && t.targets.some((u) => u.loc.line === 3),
      );
      expect(outerUse).toBeDefined();
    });
  });
});
