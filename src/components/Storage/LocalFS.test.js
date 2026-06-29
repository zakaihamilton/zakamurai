import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFileSystem } from './LocalFS';

vi.mock('@/components/state/State', async () => {
  const actual = await vi.importActual('@/components/state/State');
  return actual;
});

describe('useFileSystem', () => {
  it('returns initial filesystem state', () => {
    const { result } = renderHook(() => useFileSystem());
    expect(result.current.rootHandle).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.isReady).toBe(false);
  });
});
