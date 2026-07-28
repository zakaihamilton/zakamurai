import { describe, expect, it } from 'vitest';
import { tokenizeJs } from './JsTokenizer';

describe('JsTokenizer', () => {
  describe('tokenizeJs', () => {
    it('distinguishes division from regex literals', () => {
      const divisionTokens = tokenizeJs('const ratio = width / height;');
      expect(divisionTokens.some((t) => t.type === 'regex')).toBe(false);
      expect(divisionTokens.some((t) => t.value === '/' && t.type === 'punctuator')).toBe(true);

      const regexTokens = tokenizeJs('const re = /^foo\\/bar$/;');
      expect(regexTokens.some((t) => t.type === 'regex')).toBe(true);
      expect(regexTokens.find((t) => t.type === 'regex')?.value).toBe('/^foo\\/bar$/');
    });

    it('tokenizes template literals with expressions', () => {
      const code = 'const msg = `hello ${name}`;';
      const tokens = tokenizeJs(code);
      expect(tokens.some((t) => t.type === 'template_text')).toBe(true);
      expect(tokens.some((t) => t.value === '${')).toBe(true);
      expect(tokens.some((t) => t.type === 'template_close')).toBe(true);
    });

    it('skips single-line and block comments', () => {
      const code = ['const x = 1; // trailing', '/* block', '   comment */', 'const y = 2;'].join(
        '\n',
      );
      const tokens = tokenizeJs(code);
      expect(tokens.some((t) => t.value === 'trailing')).toBe(false);
      expect(tokens.some((t) => t.value === 'comment')).toBe(false);
      expect(tokens.filter((t) => t.type === 'identifier').map((t) => t.value)).toEqual(['x', 'y']);
    });

    it('tokenizes hex and binary numeric literals', () => {
      const tokens = tokenizeJs('const a = 0xFF; const b = 0b1010;');
      const numbers = tokens.filter((t) => t.type === 'number').map((t) => t.value);
      expect(numbers).toContain('0xFF');
      expect(numbers).toContain('0b1010');
    });

    it('tokenizes nested template literal segments', () => {
      const tokens = tokenizeJs('const s = `a${`b${c}`}d`;');
      const templateTexts = tokens.filter((t) => t.type === 'template_text');
      expect(templateTexts.length).toBeGreaterThanOrEqual(2);
      expect(tokens.filter((t) => t.value === '${').length).toBeGreaterThanOrEqual(2);
    });
  });
});
