import { describe, expect, it, vi } from 'vitest';
import { useFileSystem } from './index';

vi.mock('./LocalFS', () => {
  return {
    useFileSystem: vi.fn(() => 'mockFS'),
  };
});

describe('Storage index', () => {
  it('correctly exports useFileSystem', () => {
    expect(useFileSystem()).toBe('mockFS');
  });
});
