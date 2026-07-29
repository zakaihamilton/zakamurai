import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useCodeFolding from './CodeFolding';

describe('useCodeFolding', () => {
  it('computes JS folds and toggles collapsed fold ids', () => {
    const setCollapsedFolds = vi.fn();
    const { result } = renderHook(() =>
      useCodeFolding({
        filePath: 'App.jsx',
        localContent: 'function App() {\n  return null;\n}',
        collapsedFolds: {},
        setCollapsedFolds,
      }),
    );

    expect(result.current.foldLabel).toBe('code block');
    expect(Object.keys(result.current.foldStarts).length).toBeGreaterThan(0);

    act(() => {
      result.current.toggleFold('1:3');
    });

    expect(setCollapsedFolds).toHaveBeenCalled();
    const updater = setCollapsedFolds.mock.calls[0][0];
    expect(updater({})).toEqual({ 'App.jsx': ['1:3'] });
    expect(updater({ 'App.jsx': ['1:3'] })).toEqual({ 'App.jsx': [] });
  });

  it('uses JSON fold labeling for json files', () => {
    const { result } = renderHook(() =>
      useCodeFolding({
        filePath: 'data.json',
        localContent: '{\n  "a": 1\n}',
        collapsedFolds: {},
        setCollapsedFolds: vi.fn(),
      }),
    );

    expect(result.current.foldLabel).toBe('JSON object');
  });

  it('uses CSS fold labeling for css files', () => {
    const { result } = renderHook(() =>
      useCodeFolding({
        filePath: 'App.module.css',
        localContent: '.a {\n  color: red;\n}',
        collapsedFolds: {},
        setCollapsedFolds: vi.fn(),
      }),
    );

    expect(result.current.foldLabel).toBe('CSS block');
  });
});
