import { afterEach, describe, expect, it } from 'vitest';
import {
  createCssContentMap,
  earliestSuffixWithinTokenLimit,
  extractSymbolHeader,
  findStylesheetLinks,
  longestPrefixWithinTokenLimit,
  splitIntoChunks,
} from './rag-chunker';
import { resetEmbedder, tokenCount } from './rag-embedder';

describe('rag-chunker', () => {
  afterEach(async () => {
    await resetEmbedder();
  });

  describe('longestPrefixWithinTokenLimit', () => {
    it('returns 0 for an empty string', () => {
      expect(longestPrefixWithinTokenLimit('', 10)).toBe(0);
    });

    it('returns full length when text fits within the limit', () => {
      const text = 'hello world';
      expect(longestPrefixWithinTokenLimit(text, 100)).toBe(text.length);
    });

    it('returns 1 when even the shortest prefix exceeds the limit', () => {
      expect(longestPrefixWithinTokenLimit('abcdef', 0)).toBe(1);
    });

    it('finds the longest prefix within limit without splitting surrogate pairs', () => {
      // Each emoji is 2 UTF-16 code units (4 UTF-8 bytes)
      const emojis = '😀'.repeat(30);
      const cut = longestPrefixWithinTokenLimit(emojis, 10);
      expect(cut).toBeGreaterThan(0);
      expect(cut % 2).toBe(0);
      expect(tokenCount(emojis.slice(0, cut))).toBeLessThanOrEqual(10);
    });
  });

  describe('earliestSuffixWithinTokenLimit', () => {
    it('returns 0 for an empty string or when the whole string fits', () => {
      expect(earliestSuffixWithinTokenLimit('', 10)).toBe(0);
      expect(earliestSuffixWithinTokenLimit('short text', 50)).toBe(0);
    });

    it('returns text.length when limit is 0', () => {
      const text = 'abcdef';
      expect(earliestSuffixWithinTokenLimit(text, 0)).toBe(text.length);
    });

    it('finds earliest suffix within limit and respects surrogate pair boundaries', () => {
      const emojis = '🚀'.repeat(30);
      const start = earliestSuffixWithinTokenLimit(emojis, 12);
      expect(start).toBeGreaterThan(0);
      expect(start).toBeLessThan(emojis.length);
      expect(start % 2).toBe(0);
      expect(tokenCount(emojis.slice(start))).toBeLessThanOrEqual(12);
    });
  });

  describe('extractSymbolHeader', () => {
    it('returns null for empty, comment-only, or non-symbol snippets', () => {
      expect(extractSymbolHeader('')).toBeNull();
      expect(extractSymbolHeader('// line comment\n/* block */\n* star\n   ')).toBeNull();
      expect(extractSymbolHeader('console.log("hello");\nreturn 42;')).toBeNull();
    });

    it('extracts JS/TS symbol declarations', () => {
      expect(extractSymbolHeader('export default async function handleSubmit() {}')).toBe(
        'handleSubmit',
      );
      expect(extractSymbolHeader('export class UserService {}')).toBe('UserService');
      expect(extractSymbolHeader('const config = {};')).toBe('config');
      expect(extractSymbolHeader('let counter = 0;')).toBe('counter');
      expect(extractSymbolHeader('export interface Props {}')).toBe('Props');
      expect(extractSymbolHeader('type Alias = string;')).toBe('Alias');
      expect(extractSymbolHeader('function helper() {}')).toBe('helper');
    });

    it('extracts CSS class selector headers', () => {
      expect(extractSymbolHeader('/* styles */\n.btn-primary {\n  color: red;\n}')).toBe(
        '.btn-primary',
      );
    });
  });

  describe('splitIntoChunks', () => {
    it('returns empty array for whitespace-only content or chunks <= 10 chars', () => {
      expect(splitIntoChunks('   \n\t  ')).toEqual([]);
      expect(splitIntoChunks('const a=1;')).toEqual([]);
    });

    it('prepends file and symbol header for single symbol segment when filePath is given', () => {
      const code = 'export function greetUser(name: string) {\n  return `Hello ${name}`;\n}';
      const withPath = splitIntoChunks(code, 'src/greet.ts');
      expect(withPath).toHaveLength(1);
      expect(withPath[0]).toContain('// File: src/greet.ts | Symbol: greetUser');

      const withoutPath = splitIntoChunks(code);
      expect(withoutPath).toHaveLength(1);
      expect(withoutPath[0]).not.toContain('// File:');
    });

    it('omits symbol header for single segment without recognized symbol', () => {
      const text = 'console.log("initializing application state");';
      const chunks = splitIntoChunks(text, 'src/init.ts');
      expect(chunks).toEqual([text]);
    });

    it('merges leading imports into the following symbol segment when within token budget', () => {
      const code = [
        "import React from 'react';",
        "import styles from './App.module.css';",
        'export function App() {',
        '  return <div className={styles.root}>App</div>;',
        '}',
      ].join('\n');

      const chunks = splitIntoChunks(code, 'src/App.tsx');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("import React from 'react';");
      expect(chunks[0]).toContain('export function App()');
    });

    it('merges a non-symbol trailing segment into previous segment when within token budget', () => {
      const code = [
        'function computeValue() {',
        '  return 42;',
        '}',
        '@media (max-width: 600px) {',
        '  body { padding: 8px; }',
        '}',
      ].join('\n');

      const chunks = splitIntoChunks(code, 'src/mixed.ts');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('computeValue');
      expect(chunks[0]).toContain('@media');
    });

    it('keeps multiple symbol segments separate and skips headers when filePath is omitted', () => {
      const code = [
        'export function firstHelper() {\n  return "first helper output";\n}',
        'export function secondHelper() {\n  return "second helper output";\n}',
      ].join('\n');

      const withPath = splitIntoChunks(code, 'src/helpers.ts');
      expect(withPath).toHaveLength(2);
      expect(withPath[0]).toContain('Symbol: firstHelper');
      expect(withPath[1]).toContain('Symbol: secondHelper');

      const withoutPath = splitIntoChunks(code);
      expect(withoutPath).toHaveLength(2);
      expect(withoutPath[0]).not.toContain('// File:');
    });

    it('splits oversized segments along word/newline boundaries and handles unbroken words', () => {
      // Natural space/newline boundaries
      const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
      const wordChunks = splitIntoChunks(`function bigFn() {\n${words}\n}`, 'src/big.ts');
      expect(wordChunks.length).toBeGreaterThan(1);
      expect(wordChunks[0]).toContain('// File: src/big.ts | Symbol: bigFn');

      // Continuous token with no whitespace (forces boundary fallback)
      const unbroken = 'x'.repeat(900);
      const unbrokenChunks = splitIntoChunks(unbroken);
      expect(unbrokenChunks.length).toBeGreaterThan(1);

      // Space exactly at token limit boundary (360 bytes = 120 tokens) triggers cut trimming loop
      const spaceAtBoundary = `${'a'.repeat(360)} ${'b'.repeat(200)}`;
      const boundaryChunks = splitIntoChunks(spaceAtBoundary);
      expect(boundaryChunks.length).toBeGreaterThan(1);
    });

    it('clamps effective token limit when filePath header is very long and handles emojis', () => {
      const veryLongPath = `src/${'nested/'.repeat(60)}component.tsx`;
      const emojiBody = `export function emojiFn() {\n  return "${'🎉'.repeat(120)}";\n}`;
      const chunks = splitIntoChunks(emojiBody, veryLongPath);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain(`// File: ${veryLongPath} | Symbol: emojiFn`);
    });
  });

  describe('findStylesheetLinks', () => {
    it('resolves @/ aliases, root-relative, ./ and ../ CSS imports and deduplicates', () => {
      const knownStyles = new Set([
        'src/styles/theme.css',
        'public/reset.css',
        'src/components/Card.module.css',
        'src/shared/tokens.css',
        'src/css/base.css',
        'src/css/extra.css',
      ]);

      const content = [
        "import '@/styles/theme.css?inline';",
        "import '/public/reset.css#top';",
        "import styles from './Card.module.css';",
        "const dup = require('./Card.module.css');",
        "import tokens from '../shared/tokens.css';",
        '@import "../css/base.css";',
        "@import url('../css/extra.css');",
        '@import url(../css/base.css);',
        "import 'external-pkg/theme.css';",
        "import '../../../too-far.css';",
        "import './unknown.css';",
      ].join('\n');

      const links = findStylesheetLinks('src/components/Card.tsx', content, knownStyles);
      expect(links).toEqual([
        'src/styles/theme.css',
        'public/reset.css',
        'src/components/Card.module.css',
        'src/shared/tokens.css',
        'src/css/base.css',
        'src/css/extra.css',
      ]);
    });

    it('handles ./ and redundant slashes in relative paths', () => {
      const knownStyles = new Set(['src/a/b.css']);
      const content = "import '././a/../a/b.css';";
      expect(findStylesheetLinks('src/index.ts', content, knownStyles)).toEqual(['src/a/b.css']);
    });
  });

  describe('createCssContentMap', () => {
    it('includes only .css files (case-insensitive) with string contents', () => {
      const files = {
        'src/App.css': '.app { color: red; }',
        'src/Theme.CSS': '.theme { color: blue; }',
        'src/App.tsx': 'export default function App() {}',
        'src/empty.css': undefined as unknown as string,
      };
      const map = createCssContentMap(files);
      expect([...map.entries()]).toEqual([
        ['src/App.css', '.app { color: red; }'],
        ['src/Theme.CSS', '.theme { color: blue; }'],
      ]);
    });
  });
});
