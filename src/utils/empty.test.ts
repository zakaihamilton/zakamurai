import { describe, expect, it } from 'vitest';
import empty from './empty';

describe('empty utility', () => {
  it('exports an empty object', () => {
    expect(empty).toEqual({});
  });
});
