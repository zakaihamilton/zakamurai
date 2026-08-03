export type FileSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'component' | 'const';

export type FileSymbol = {
  name: string;
  kind: FileSymbolKind;
  signature: string;
  line: number;
  isExported: boolean;
};

export type FileDependency = {
  source: string;
  specifiers: string[];
};

export type FileSymbolOutline = {
  path: string;
  symbols: FileSymbol[];
  imports: FileDependency[];
  exports: string[];
};

export function extractFileSymbols(content: string, path: string): FileSymbolOutline {
  const lines = content.split('\n');
  const symbols: FileSymbol[] = [];
  const imports: FileDependency[] = [];
  const exports: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    // Parse imports: import { a, b } from './module'; or import x from 'y'; or import React, { useState } from 'react';
    const importMatch = line.match(/^import\s+(?:type\s+)?([\s\S]+?)\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const rawClause = importMatch[1].trim();
      const source = importMatch[2];
      const specifiers: string[] = [];

      const defaultMatch = rawClause.match(/^([A-Za-z0-9_]+)\s*(?:,|$)/);
      if (
        defaultMatch &&
        defaultMatch[1] !== 'type' &&
        !rawClause.startsWith('{') &&
        !rawClause.startsWith('*')
      ) {
        specifiers.push(defaultMatch[1]);
      }

      const namedMatch = rawClause.match(/\{([^}]+)\}/);
      if (namedMatch) {
        const names = namedMatch[1]
          .split(',')
          .map(
            (s) =>
              s
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)[0],
          )
          .filter(Boolean);
        specifiers.push(...names);
      }

      const nsMatch = rawClause.match(/\*\s+as\s+([A-Za-z0-9_]+)/);
      if (nsMatch) {
        specifiers.push(nsMatch[1]);
      }

      imports.push({ source, specifiers: specifiers.length ? specifiers : ['default'] });
      continue;
    }

    // Parse interface: export interface Foo { ... }
    const interfaceMatch = line.match(/^(export\s+)?interface\s+([A-Za-z0-9_]+)/);
    if (interfaceMatch) {
      const isExported = Boolean(interfaceMatch[1]);
      const name = interfaceMatch[2];
      symbols.push({
        name,
        kind: 'interface',
        signature: line.replace(/\{$/, '').trim(),
        line: lineNum,
        isExported,
      });
      if (isExported) exports.push(name);
      continue;
    }

    // Parse type: export type Foo = ...
    const typeMatch = line.match(/^(export\s+)?type\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      const isExported = Boolean(typeMatch[1]);
      const name = typeMatch[2];
      symbols.push({
        name,
        kind: 'type',
        signature: line.slice(0, 100).trim(),
        line: lineNum,
        isExported,
      });
      if (isExported) exports.push(name);
      continue;
    }

    // Parse function / component: export function Foo(...) or export const Foo = (...) =>
    const funcMatch = line.match(
      /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/,
    );
    if (funcMatch) {
      const isExported = Boolean(funcMatch[1]);
      const name = funcMatch[2];
      const isComponent = /^[A-Z]/.test(name);
      symbols.push({
        name,
        kind: isComponent ? 'component' : 'function',
        signature: `${name}(${funcMatch[3].trim()})`,
        line: lineNum,
        isExported,
      });
      if (isExported) exports.push(name);
      continue;
    }

    const constFuncMatch = line.match(
      /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/,
    );
    if (constFuncMatch) {
      const isExported = Boolean(constFuncMatch[1]);
      const name = constFuncMatch[2];
      const isComponent = /^[A-Z]/.test(name);
      symbols.push({
        name,
        kind: isComponent ? 'component' : 'function',
        signature: `${name}(${constFuncMatch[3].trim()}) => ...`,
        line: lineNum,
        isExported,
      });
      if (isExported) exports.push(name);
      continue;
    }

    // Parse class: export class Foo
    const classMatch = line.match(/^(export\s+)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      const isExported = Boolean(classMatch[1]);
      const name = classMatch[2];
      symbols.push({
        name,
        kind: 'class',
        signature: line.replace(/\{$/, '').trim(),
        line: lineNum,
        isExported,
      });
      if (isExported) exports.push(name);
    }
  }

  return { path, symbols, imports, exports };
}

export function formatSymbolOutline(outline: FileSymbolOutline): string {
  const parts: string[] = [`File: ${outline.path}`];

  if (outline.imports.length > 0) {
    parts.push('Imports:');
    for (const imp of outline.imports) {
      parts.push(`  - from "${imp.source}": ${imp.specifiers.join(', ') || 'default'}`);
    }
  }

  if (outline.symbols.length > 0) {
    parts.push('Symbols:');
    for (const sym of outline.symbols) {
      const expTag = sym.isExported ? ' [export]' : '';
      parts.push(`  - L${sym.line}: [${sym.kind}] ${sym.signature}${expTag}`);
    }
  } else {
    parts.push('No top-level function, class, or type symbols extracted.');
  }

  return parts.join('\n');
}
