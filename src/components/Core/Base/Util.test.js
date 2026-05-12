import { describe, expect, it, vi } from 'vitest';
import { create } from './Util';

describe('Util', () => {
  it('create should populate target with functions', () => {
    const target = {};
    const name = 'Test';
    const mockFunc = vi.fn((path) => `called ${path}`);
    const fields = {
      method1: (path) => mockFunc(path),
      method2: (path) => mockFunc(path),
    };

    create(target, name, fields);

    expect(target.method1).toBeDefined();
    expect(target.method2).toBeDefined();

    expect(target.method1).toBe('called Test.method1');
    expect(target.method2).toBe('called Test.method2');
  });
});
