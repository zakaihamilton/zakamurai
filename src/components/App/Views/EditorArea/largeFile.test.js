import { describe, expect, it } from 'vitest';
import { shouldDeferEditorAnalysis } from './largeFile';

describe('shouldDeferEditorAnalysis', () => {
  it('defers analysis past either the character or line threshold', () => {
    expect(shouldDeferEditorAnalysis('x'.repeat(250001))).toBe(true);
    expect(shouldDeferEditorAnalysis('x\n'.repeat(2000))).toBe(true);
    expect(shouldDeferEditorAnalysis('const value = 1;')).toBe(false);
  });
});
