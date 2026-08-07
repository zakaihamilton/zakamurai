import { describe, expect, it } from 'vitest';
import ModelManager from './index';

describe('ModelManager index', () => {
  it('exports the ModelManager component', () => {
    expect(ModelManager).toBeTypeOf('function');
  });
});
