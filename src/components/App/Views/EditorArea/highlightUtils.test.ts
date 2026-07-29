import { describe, expect, it } from 'vitest';
import {
  countLines,
  decodeIdx,
  encodeIdx,
  escapeHtml,
  getLineColumn,
  isJsonPath,
} from './highlightUtils';

describe('highlightUtils', () => {
  it('encodes and decodes navigation index markers', () => {
    expect(encodeIdx(12)).toBe('bc');
    expect(decodeIdx('bc')).toBe(12);
    expect(decodeIdx(encodeIdx(905))).toBe(905);
  });

  it('escapes HTML entities', () => {
    expect(escapeHtml('<div class="a & b">')).toBe('&lt;div class="a &amp; b"&gt;');
  });

  it('detects JSON-like file paths', () => {
    expect(isJsonPath('settings.json')).toBe(true);
    expect(isJsonPath('config.jsonc')).toBe(true);
    expect(isJsonPath('manifest.webmanifest')).toBe(true);
    expect(isJsonPath('json')).toBe(true);
    expect(isJsonPath('index.js')).toBe(false);
  });

  it('counts lines and handles empty values', () => {
    expect(countLines('')).toBe(1);
    expect(countLines('one')).toBe(1);
    expect(countLines('one\ntwo\nthree')).toBe(3);
  });

  it('maps indexes to line and column positions', () => {
    const code = 'abc\ndef\nghi';
    expect(getLineColumn(code, 0)).toEqual({ line: 1, column: 1 });
    expect(getLineColumn(code, 4)).toEqual({ line: 2, column: 1 });
    expect(getLineColumn(code, 6)).toEqual({ line: 2, column: 3 });
    expect(getLineColumn(code, 999)).toEqual({ line: 3, column: 4 });
    expect(getLineColumn(code, -5)).toEqual({ line: 1, column: 1 });
  });
});
