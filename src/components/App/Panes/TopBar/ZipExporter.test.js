import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useZipExporter from './ZipExporter';

describe('useZipExporter', () => {
  it('returns zip export hooks', () => {
    const mockFs = { mode: 'local' };
    const mockEditorState = { fileContents: {} };
    const mockFolderTree = [];
    const projectName = 'Test Project';

    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

    expect(result.current.handleExportZip).toBeTypeOf('function');
    expect(result.current.handleExportCompiledZip).toBeTypeOf('function');
  });
});
