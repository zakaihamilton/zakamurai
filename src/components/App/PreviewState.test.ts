import { describe, expect, it } from 'vitest';
import { PreviewState } from './PreviewState';

describe('PreviewState', () => {
  it('exposes a createState handle with useState', () => {
    expect(PreviewState).toBeTypeOf('function');
    expect(PreviewState.useState).toBeTypeOf('function');
    expect(PreviewState.usePassiveState).toBeTypeOf('function');
  });
});
