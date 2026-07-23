import { describe, expect, it } from 'vitest';
import { buildCssModuleJavaScript, simpleHash } from './dev-server';

describe('simpleHash', () => {
  it('returns a stable short hex-like string', () => {
    expect(simpleHash('hello')).toBe(simpleHash('hello'));
    expect(simpleHash('hello')).not.toBe(simpleHash('world'));
    expect(simpleHash('abc')).toMatch(/^[0-9a-z]+$/);
    expect(simpleHash('abc').length).toBeLessThanOrEqual(6);
  });
});

describe('buildCssModuleJavaScript', () => {
  it('scopes local class names and preserves :global selectors', () => {
    const css = `
.button { color: red; }
:global(.legacy) { color: blue; }
:global {
  body { margin: 0; }
}
`;
    const { js, classMap, scopedCss, fileHash } = buildCssModuleJavaScript(
      '/src/Button.module.css',
      css,
    );

    expect(fileHash).toBeTruthy();
    expect(classMap.button).toBe(`button_${fileHash}`);
    expect(scopedCss).toContain(`.button_${fileHash}`);
    expect(scopedCss).toContain('.legacy');
    expect(scopedCss).toContain('body { margin: 0; }');
    expect(js).toContain('export default classMap');
    expect(js).toContain(`button_${fileHash}`);
    expect(js).toContain('data-vite-dev-id');
  });

  it('hashes class names consistently for the same file contents', () => {
    const css = '.card { padding: 8px; }';
    const first = buildCssModuleJavaScript('/a.module.css', css);
    const second = buildCssModuleJavaScript('/a.module.css', css);
    expect(first.classMap).toEqual(second.classMap);
    expect(first.fileHash).toBe(second.fileHash);
  });
});
