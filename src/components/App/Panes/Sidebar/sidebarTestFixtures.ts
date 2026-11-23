import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileSystemApi } from '@/test-utils/fsMocks';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode } from '@/test-utils/treeMocks';
import { vi } from 'vitest';
import type useSidebarFileLoader from './SidebarFileLoader';

type SidebarFileLoaderArgs = Parameters<typeof useSidebarFileLoader>[0];

export function makeSidebarStateForFile(path: string[], handle?: FileSystemFileHandle) {
  let node = asNormalizedTreeNode({
    name: path.at(-1) || '',
    type: 'file',
    path,
    ...(handle ? { handle } : {}),
  });

  for (let index = path.length - 2; index >= 0; index -= 1) {
    node = asNormalizedTreeNode({
      name: path[index],
      type: 'folder',
      path: path.slice(0, index + 1),
      children: [node],
    });
  }

  return makeSidebarState({ folderTree: [node] });
}

export function makeSidebarLoaderDefaultArgs(
  overrides: Partial<SidebarFileLoaderArgs> = {},
): SidebarFileLoaderArgs {
  return {
    fs: makeFileSystemApi({
      mode: 'sandbox',
      triggerRefresh: vi.fn(),
      readFile: vi.fn().mockResolvedValue('file text'),
    }),
    appState: makeAppState({ isMobile: false }),
    sidebarState: makeSidebarState(),
    tabState: createMockTabState(),
    editorState: createMockEditorState({ fileContents: { 'src/App.js': 'code' } }),
    setLoadingPaths: vi.fn(),
    addNotification: vi.fn(),
    ...overrides,
  };
}
