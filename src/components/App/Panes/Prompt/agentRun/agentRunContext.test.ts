import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import {
  clearPreviewEvidence,
  reportPreviewEvidence,
} from '@/components/App/Views/PreviewArea/previewEvidenceBridge';
import type { FileSystemApi } from '@/components/App/types';
import Settings from '@/components/Storage/Settings';
import type { AppStateShape } from '@/types/domain-types';
import type { PreviewStateShape, SidebarStateShape, TabStateShape } from '@/types/domain-types';
import type { StateStore } from 'triactor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManagerToolOptions, prepareAgentRunContext } from './agentRunContext';

function makeStore<T extends object>(value: T, afterUpdate?: (next: T) => void): StateStore<T> {
  const store = vi.fn((update: (draft: T) => void) => {
    update(value);
    afterUpdate?.(value);
  });
  Object.assign(store, value);
  return store as unknown as StateStore<T>;
}

describe('createManagerToolOptions preview inspection', () => {
  beforeEach(() => {
    clearPreviewEvidence();
  });

  it('mounts the preview surface without changing the active tab', async () => {
    const tabStateValue: TabStateShape = {
      openTabs: [],
      activeTabId: 'src/App.jsx',
      lastCodeTabId: 'src/App.jsx',
    };
    const tabState = makeStore(tabStateValue);
    const previewStateValue: PreviewStateShape = {
      htmlContent: null,
      isCompilerReady: false,
      previewAddress: '/preview/dist/index.html',
      previewSessionId: null,
      containerStatus: 'idle',
      compileStatus: 'idle',
      compilePhase: null,
      lastCompileAt: null,
      containerError: null,
    };
    const previewState = makeStore(previewStateValue, (next) => {
      if (next.htmlContent?.includes('zakamurai-ai-preview')) {
        reportPreviewEvidence({
          path: '/preview/dist/index.html',
          title: 'Notes',
          text: 'Notes app',
          elements: ['main: Notes'],
          screenshotCaptured: true,
        });
      }
    });
    const sidebarState = makeStore({ folderTree: [] } as unknown as SidebarStateShape);
    const vfs = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => '<html><body><div id="root"></div></body></html>'),
      writeFileSync: vi.fn(),
    };
    const compiler = {
      compile: vi.fn().mockResolvedValue(undefined),
      container: { vfs },
    };
    const Compiler = vi.fn(() => compiler) as unknown as typeof import('@/utils/compiler').Compiler;
    const options = createManagerToolOptions({
      Compiler,
      fs: { mode: 'opfs', rootHandle: null } as unknown as FileSystemApi,
      sidebarState,
      tabState,
      previewState,
    });

    const result = await options.inspectPreview?.({
      'src/App.jsx': 'export default function App() {}',
    });

    expect(result).toMatchObject({
      status: 'passed',
      path: '/preview/dist/index.html',
      screenshotCaptured: true,
    });
    expect(tabStateValue.activeTabId).toBe('src/App.jsx');
    expect(tabStateValue.openTabs).toEqual([{ id: 'preview', type: 'preview', label: 'Preview' }]);
    expect(vfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      '<html><body><div id="root"></div></body></html>',
    );
  });

  it('keeps the current tab active after a successful welcome-run preview inspection', async () => {
    const tabStateValue: TabStateShape = {
      openTabs: [{ id: 'ai-section:reasoning', type: 'ai-section', label: 'Progress & Reasoning' }],
      activeTabId: 'ai-section:reasoning',
      lastCodeTabId: null,
    };
    const tabState = makeStore(tabStateValue);
    const previewStateValue: PreviewStateShape = {
      htmlContent: null,
      isCompilerReady: false,
      previewAddress: '/preview/dist/index.html',
      previewSessionId: null,
      containerStatus: 'idle',
      compileStatus: 'idle',
      compilePhase: null,
      lastCompileAt: null,
      containerError: null,
    };
    const previewState = makeStore(previewStateValue, (next) => {
      if (next.htmlContent?.includes('zakamurai-ai-preview')) {
        reportPreviewEvidence({
          path: '/preview/dist/index.html',
          title: 'Notes',
          text: 'Notes app',
          elements: ['main: Notes'],
          screenshotCaptured: true,
        });
      }
    });
    const sidebarState = makeStore({ folderTree: [] } as unknown as SidebarStateShape);
    const vfs = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => '<html><body><div id="root"></div></body></html>'),
      writeFileSync: vi.fn(),
    };
    const compiler = {
      compile: vi.fn().mockResolvedValue(undefined),
      container: { vfs },
    };
    const Compiler = vi.fn(() => compiler) as unknown as typeof import('@/utils/compiler').Compiler;
    const options = createManagerToolOptions({
      Compiler,
      fs: { mode: 'opfs', rootHandle: null } as unknown as FileSystemApi,
      sidebarState,
      tabState,
      previewState,
    });

    await options.inspectPreview?.({ 'src/App.jsx': 'export default function App() {}' });

    expect(tabStateValue.activeTabId).toBe('ai-section:reasoning');
  });

  it('prepares AI context and recovery from the latest dirty editor buffers', async () => {
    const saveCheckpoint = vi.spyOn(Settings, 'saveRecoveryCheckpoint').mockResolvedValue(true);
    const editorState = makeStore({
      fileContents: { 'src/App.jsx': 'committed source' },
      dirtyBufferContents: { 'src/App.jsx': 'latest typed source' },
      pendingDiffs: {},
      pendingDeletions: {},
    } as unknown as ExtendedEditorState);
    const tabState = makeStore({
      openTabs: [{ id: 'src/App.jsx', type: 'file', label: 'App.jsx' }],
      activeTabId: 'src/App.jsx',
      lastCodeTabId: 'src/App.jsx',
    } as TabStateShape);
    const appState = makeStore({ projectName: 'AI buffers' } as AppStateShape);
    const appendReasoning = vi.fn();

    try {
      const context = await prepareAgentRunContext({
        fs: { mode: 'sandbox', rootHandle: null } as unknown as FileSystemApi,
        editorState,
        tabState,
        appState,
        appendReasoning,
      });

      expect(context.workspaceFiles['src/App.jsx']).toBe('latest typed source');
      expect(saveCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'ai-change',
          projectName: 'AI buffers',
          fileContents: { 'src/App.jsx': 'latest typed source' },
        }),
      );
    } finally {
      saveCheckpoint.mockRestore();
    }
  });
});
