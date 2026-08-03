import { describe, expect, it } from 'vitest';
import { extractFileSymbols, formatSymbolOutline } from './SymbolInspector';

describe('SymbolInspector', () => {
  const sampleCode = `
import React, { useState } from 'react';
import { Button } from './components/Button';

export interface AppProps {
  title: string;
}

export type Theme = 'light' | 'dark';

export function Header(props: AppProps) {
  return <h1>{props.title}</h1>;
}

export const calculateTotal = (a: number, b: number) => {
  return a + b;
};

class DataStore {
  save() {}
}
`;

  it('extracts imports, interfaces, types, functions, and components', () => {
    const outline = extractFileSymbols(sampleCode, 'src/App.tsx');
    expect(outline.imports).toHaveLength(2);
    expect(outline.imports[0].source).toBe('react');
    expect(outline.imports[0].specifiers).toContain('useState');

    expect(outline.exports).toContain('AppProps');
    expect(outline.exports).toContain('Theme');
    expect(outline.exports).toContain('Header');

    const headerSym = outline.symbols.find((s) => s.name === 'Header');
    expect(headerSym?.kind).toBe('component');
    expect(headerSym?.isExported).toBe(true);

    const calcSym = outline.symbols.find((s) => s.name === 'calculateTotal');
    expect(calcSym?.kind).toBe('function');
  });

  it('formats symbol outlines cleanly for model context', () => {
    const outline = extractFileSymbols(sampleCode, 'src/App.tsx');
    const formatted = formatSymbolOutline(outline);

    expect(formatted).toContain('File: src/App.tsx');
    expect(formatted).toContain('Imports:');
    expect(formatted).toContain('L5: [interface] export interface AppProps [export]');
    expect(formatted).toContain('L11: [component] Header(props: AppProps) [export]');
  });
});
