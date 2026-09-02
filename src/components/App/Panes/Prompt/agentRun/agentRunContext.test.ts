import {
  clearPreviewEvidence,
  reportPreviewEvidence,
} from '@/components/App/Views/PreviewArea/previewEvidenceBridge';
import type { FileSystemApi } from '@/components/App/types';
import type { PreviewStateShape, SidebarStateShape, TabStateShape } from '@/types/domain-types';
import type { StateStore } from 'triactor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManagerToolOptions } from './agentRunContext';

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

  it('activates the preview surface before waiting for staged evidence', async () => {
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
    expect(tabStateValue.activeTabId).toBe('preview');
    expect(tabStateValue.openTabs).toEqual([{ id: 'preview', type: 'preview', label: 'Preview' }]);
    expect(vfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      '<html><body><div id="root"></div></body></html>',
    );
  });

  it('restores the reasoning tab after welcome-run preview inspection', async () => {
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
      deferPreviewNavigation: true,
    });

    await options.inspectPreview?.({ 'src/App.jsx': 'export default function App() {}' });

    expect(tabStateValue.activeTabId).toBe('ai-section:reasoning');
  });
});
