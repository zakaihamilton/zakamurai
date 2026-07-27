import { describe, expect, it } from 'vitest';
import { extractImports, extractSymbols, getLanguage, isIndexablePath } from './symbols';

describe('workspace symbols', () => {
  it('classifies web-stack paths and extracts source symbols', () => {
    expect(getLanguage('src/App.tsx')).toBe('typescript');
    expect(isIndexablePath('src/App.tsx')).toBe(true);
    expect(isIndexablePath('assets/photo.png')).toBe(false);
    expect(
      extractSymbols('src/App.tsx', 'export function App() {}\nexport const theme = 1;'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'App', kind: 'function', line: 1 }),
        expect.objectContaining({ name: 'theme', kind: 'symbol', line: 2 }),
      ]),
    );
  });

  it('collects static imports for impact analysis', () => {
    expect(extractImports("import App from './App';\nexport { x } from './shared';")).toEqual([
      './App',
      './shared',
    ]);
  });
});
