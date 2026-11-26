import { act, render, waitFor } from '@testing-library/react';
import { StateRoot } from 'triactor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebLLMState } from '@/components/AI/WebLLMState';
import type { FileSystemApi, InitialAppValues } from '@/components/App/types';
import {
  ChangeSetState,
  DEFAULT_WORKSPACE_HEALTH,
  ProblemsState,
  WorkspaceHealthState,
} from '@/components/Workspace';
import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { makeDirectoryHandle, makeFileSystemApi } from '@/test-utils/fsMocks';
import { AppState } from './AppState';
import { PromptState, PromptUiState, SidebarState, TabState } from './Panes';
import { AgentSessionState } from './Panes/Prompt/AgentSessions';
import { PreviewState } from './PreviewState';
import useAppStores from './useAppStores';
import { EditorState } from './Views/EditorArea';
import { LogState } from './Views/LogArea';

const bindDiagnosticsStateMock = vi.fn();
const bindWebLLMStoreMock = vi.fn();
const markPerformanceMock = vi.fn();
const measurePerformanceMock = vi.fn();
const useWindowResizeMock = vi.fn();
const useSettingsSyncMock = vi.fn();

vi.mock('@/components/Diagnostics', () => ({
  DiagnosticsState: {
    useState: vi.fn((_id, initial) => Object.assign(vi.fn(), initial)),
  },
  bindDiagnosticsState: (...args: unknown[]) => bindDiagnosticsStateMock(...args),
}));

vi.mock('@/components/AI/WebLLMState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/AI/WebLLMState')>();
  return {
    ...actual,
    bindWebLLMStore: (...args: unknown[]) => bindWebLLMStoreMock(...args),
  };
});

vi.mock('@/components/Performance', () => ({
  markPerformance: (...args: unknown[]) => markPerformanceMock(...args),
  measurePerformance: (...args: unknown[]) => measurePerformanceMock(...args),
}));

vi.mock('./WindowResize', () => ({
  useWindowResize: (...args: unknown[]) => useWindowResizeMock(...args),
}));

vi.mock('@/components/Storage/SettingsSync', () => ({
  useSettingsSync: (...args: unknown[]) => useSettingsSyncMock(...args),
}));

type CapturedStores = {
  appState: ReturnType<typeof AppState.useState>;
  sidebarState: ReturnType<typeof SidebarState.useState>;
  tabState: ReturnType<typeof TabState.useState>;
  logState: ReturnType<typeof LogState.useState>;
  editorState: ReturnType<typeof EditorState.useState>;
  promptState: ReturnType<typeof PromptState.useState>;
  promptUiState: ReturnType<typeof PromptUiState.useState>;
  agentSessionState: ReturnType<typeof AgentSessionState.useState>;
  previewState: ReturnType<typeof PreviewState.useState>;
  problemsState: ReturnType<typeof ProblemsState.useState>;
  workspaceHealthState: ReturnType<typeof WorkspaceHealthState.useState>;
  changeSetState: ReturnType<typeof ChangeSetState.useState>;
  webLLMState: ReturnType<typeof WebLLMState.useState>;
};

function makeInitialValues(overrides: Partial<InitialAppValues> = {}): InitialAppValues {
  return {
    projectName: 'Initial Project',
    files: [{ name: 'App.tsx', type: 'file', path: ['src', 'App.tsx'] }],
    contents: { 'src/App.tsx': 'export default function App() {}' },
    theme: 'dark',
    tabs: [{ id: 'src/App.tsx', label: 'App.tsx', type: 'file' }],
    activeTabId: 'src/App.tsx',
    lastCodeTabId: 'src/App.tsx',
    aiLogs: [{ id: '1', role: 'info', text: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
    sidebarWidth: 260,
    promptWidth: 340,
    isSidebarOpen: true,
    showAIInput: true,
    expandedFolders: { src: true },
    aiCompletionEnabled: true,
    isReadOnly: false,
    promptHistory: ['build a todo app'],
    previewHtml: '<div>preview</div>',
    pendingDiffs: {},
    pendingDeletions: {},
    agentSessions: {
      activeSessionId: 'session-1',
      sessions: {
        'session-1': {
          id: 'session-1',
          name: 'Session 1',
          mode: 'single',
          modelId: null,
          parentId: null,
          roleGraph: null,
          reasoning: '',
          messages: [],
          status: 'idle',
          createdAt: 1,
          updatedAt: 1,
        },
      },
    },
    workspaceProfile: {},
    changeSets: {
      activeId: 'cs-1',
      items: [
        {
          id: 'cs-1',
          request: 'Change',
          status: 'pending',
          createdAt: 1,
          files: [],
        },
      ],
    },
    ...overrides,
  };
}

function StoreHarness({
  initialValues,
  fs,
  onStores,
}: {
  initialValues: InitialAppValues;
  fs: FileSystemApi;
  onStores: (stores: CapturedStores) => void;
}) {
  useAppStores(initialValues, fs);
  const appState = AppState.useState();
  const sidebarState = SidebarState.useState();
  const tabState = TabState.useState();
  const logState = LogState.useState();
  const editorState = EditorState.useState();
  const promptState = PromptState.useState();
  const promptUiState = PromptUiState.useState();
  const agentSessionState = AgentSessionState.useState();
  const previewState = PreviewState.useState();
  const problemsState = ProblemsState.useState();
  const workspaceHealthState = WorkspaceHealthState.useState();
  const changeSetState = ChangeSetState.useState();
  const webLLMState = WebLLMState.useState();

  onStores({
    appState,
    sidebarState,
    tabState,
    logState,
    editorState,
    promptState,
    promptUiState,
    agentSessionState,
    previewState,
    problemsState,
    workspaceHealthState,
    changeSetState,
    webLLMState,
  });

  return null;
}

describe('useAppStores', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = '';
    window.innerWidth = 1280;
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('initializes stores inside StateRoot, binds and unbinds listeners, and toggles theme class', async () => {
    window.innerWidth = MOBILE_BREAKPOINT;
    let captured: CapturedStores | undefined;
    const fs = makeFileSystemApi({ mode: 'local', isReady: true });
    const initialValues = makeInitialValues({
      theme: 'light',
      changeSets: undefined as unknown as InitialAppValues['changeSets'],
    });

    let rerender!: ReturnType<typeof render>['rerender'];
    let unmount!: ReturnType<typeof render>['unmount'];
    await act(async () => {
      const rendered = render(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fs}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
      rerender = rendered.rerender;
      unmount = rendered.unmount;
    });

    expect(captured?.appState?.isMobile).toBe(true);
    expect(captured?.changeSetState?.items).toEqual([]);
    expect(document.body.classList.contains('light')).toBe(true);
    expect(markPerformanceMock).toHaveBeenCalledWith('app-ready');
    expect(measurePerformanceMock).toHaveBeenCalledWith(
      'app-hydration',
      'app-hydration-start',
      'app-ready',
    );
    expect(bindDiagnosticsStateMock).toHaveBeenCalledWith(expect.anything());
    expect(bindWebLLMStoreMock).toHaveBeenCalledWith(captured?.webLLMState);
    expect(useWindowResizeMock).toHaveBeenCalledWith(captured?.appState, captured?.sidebarState);
    expect(useSettingsSyncMock).toHaveBeenLastCalledWith(
      captured?.appState,
      captured?.sidebarState,
      captured?.promptState,
      captured?.editorState,
      captured?.agentSessionState,
      captured?.tabState,
      captured?.logState,
      captured?.previewState,
      captured?.promptUiState,
      expect.anything(),
      captured?.changeSetState,
      true,
    );

    // Toggle theme to dark removes 'light' class
    await act(async () => {
      captured?.appState?.((draft) => {
        draft.theme = 'dark';
      });
    });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fs}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });
    expect(document.body.classList.contains('light')).toBe(false);

    unmount();
    expect(bindDiagnosticsStateMock).toHaveBeenLastCalledWith(null);
    expect(bindWebLLMStoreMock).toHaveBeenLastCalledWith(null);
  });

  it('waits for fs.isReady, syncs projectName, and handles rootHandle unlink/switch without isSameEntry', async () => {
    let captured: CapturedStores | undefined;
    const initialValues = makeInitialValues({ projectName: 'My App' });
    const fsUnready = makeFileSystemApi({ mode: 'opfs', isReady: false, rootHandle: null });

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      rerender = render(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsUnready}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      ).rerender;
    });

    expect(useSettingsSyncMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      false,
    );

    // First time fs becomes ready with rootHandle1: records initial handle without resetting state
    const root1 = makeDirectoryHandle('WorkspaceOne');
    const fsReady1 = makeFileSystemApi({ mode: 'local', isReady: true, rootHandle: root1 });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsReady1}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    expect(captured?.appState?.projectName).toBe('WorkspaceOne');
    expect(captured?.tabState?.openTabs).toHaveLength(1);
    expect(captured?.appState?.workspaceEpoch).toBe(0);

    // Re-rendering with the exact same rootHandle does not increment workspaceEpoch
    const fsReady1SameRef = makeFileSystemApi({
      mode: 'local',
      isReady: true,
      rootHandle: root1,
    });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsReady1SameRef}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });
    expect(captured?.appState?.workspaceEpoch).toBe(0);

    // Prepare active abort controller and running session before switching to null root
    const abortSpy = vi.fn();
    await act(async () => {
      captured?.promptUiState?.((draft) => {
        draft.runningSessionId = 'session-1';
        draft.abortController = { abort: abortSpy } as unknown as AbortController;
      });
      captured?.logState?.((draft) => {
        draft.isAIProcessing = true;
      });
      captured?.agentSessionState?.((draft) => {
        draft.sessions = {
          'session-1': {
            ...draft.sessions['session-1'],
            status: 'running',
            activity: {
              runId: 'run-1',
              request: 'thinking',
              outcome: 'running',
              currentPhase: 'routing',
              currentNodeId: null,
              startedAt: 1,
              durationMs: 0,
              lastTraceSequence: 0,
              nodes: [],
            },
          },
        };
      });
      captured?.sidebarState?.((draft) => {
        draft.draggedItem = { path: 'a.ts', type: 'file' } as never;
      });
    });

    // Switch rootHandle to null: fences epoch, aborts AI, clears draggedItem, but keeps workspace buffers
    const fsNullRoot = makeFileSystemApi({ mode: 'opfs', isReady: true, rootHandle: null });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsNullRoot}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(captured?.appState?.workspaceEpoch).toBe(1);
    expect(captured?.promptUiState?.runningSessionId).toBeNull();
    expect(captured?.logState?.isAIProcessing).toBe(false);
    expect(captured?.agentSessionState?.sessions['session-1'].status).toBe('idle');
    expect(captured?.sidebarState?.draggedItem).toBeNull();
    expect(captured?.tabState?.openTabs).toHaveLength(1);

    // Switch from null rootHandle to root2 (no previousRootHandle -> synchronous resetForNewRoot)
    // Also exercise empty root2.name fallback and selectedModel truthy branch
    await act(async () => {
      captured?.promptUiState?.((draft) => {
        draft.selectedModel = 'Qwen3.5-4B';
      });
    });
    const root2 = makeDirectoryHandle('');
    const fsReady2 = makeFileSystemApi({ mode: 'local', isReady: true, rootHandle: root2 });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsReady2}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    expect(captured?.appState?.projectName).toBe('WorkspaceOne');
    expect(captured?.appState?.workspaceEpoch).toBe(2);
    expect(captured?.sidebarState?.folderTree).toEqual([]);
    expect(captured?.tabState?.openTabs).toEqual([]);
    expect(captured?.editorState?.fileContents).toEqual({});
    expect(captured?.changeSetState?.items).toEqual([]);
    expect(captured?.problemsState?.items).toEqual([]);
    expect(captured?.workspaceHealthState?.status).toBe(DEFAULT_WORKSPACE_HEALTH.status);
    expect(captured?.promptState?.promptHistory).toEqual([]);
    expect(captured?.logState?.logs).toEqual([]);
    expect(captured?.previewState?.htmlContent).toBeNull();
  });

  it('handles async isSameEntry resolution (true, false, rejection, and stale generation)', async () => {
    let captured: CapturedStores | undefined;
    const initialValues = makeInitialValues();

    const makeHandleWithSameEntry = (name: string, impl: () => Promise<boolean>) =>
      ({
        ...makeDirectoryHandle(name),
        isSameEntry: vi.fn(impl),
      }) as unknown as FileSystemDirectoryHandle;

    // Case 1: isSameEntry resolves true -> keeps existing state
    const rootA = makeHandleWithSameEntry('ProjectA', async () => true);
    const rootASame = makeHandleWithSameEntry('ProjectA', async () => true);

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      rerender = render(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={makeFileSystemApi({ isReady: true, rootHandle: rootA })}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      ).rerender;
    });

    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={makeFileSystemApi({ isReady: true, rootHandle: rootASame })}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    await waitFor(() => {
      expect(rootA.isSameEntry).toHaveBeenCalledWith(rootASame);
    });
    expect(captured?.tabState?.openTabs).toHaveLength(1);

    // Case 2: isSameEntry resolves false -> resets workspace
    const rootB = makeHandleWithSameEntry('ProjectB', async () => false);
    vi.mocked(rootASame.isSameEntry).mockResolvedValueOnce(false);
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={makeFileSystemApi({ isReady: true, rootHandle: rootB })}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    await waitFor(() => {
      expect(captured?.tabState?.openTabs).toEqual([]);
    });
    expect(captured?.appState?.projectName).toBe('ProjectB');

    // Case 3: isSameEntry rejects -> falls back to resetting workspace
    await act(async () => {
      captured?.tabState?.((draft) => {
        draft.openTabs = [{ id: 'repopulated', label: 'Repopulated', type: 'file' }];
      });
    });
    vi.mocked(rootB.isSameEntry).mockRejectedValueOnce(new Error('permission denied'));
    const rootC = makeHandleWithSameEntry('ProjectC', async () => true);
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={makeFileSystemApi({ isReady: true, rootHandle: rootC })}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    await waitFor(() => {
      expect(captured?.tabState?.openTabs).toEqual([]);
    });

    // Case 4: stale generation guard when a second switch occurs before first isSameEntry settles
    let resolveSlowSameEntry!: (value: boolean) => void;
    vi.mocked(rootC.isSameEntry).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSlowSameEntry = resolve;
        }),
    );
    const rootD = makeHandleWithSameEntry('ProjectD', async () => true);
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={makeFileSystemApi({ isReady: true, rootHandle: rootD })}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    // Immediately switch to rootE (without isSameEntry on rootD)
    const rootE = makeDirectoryHandle('ProjectE');
    const fsE = makeFileSystemApi({ isReady: true, rootHandle: rootE });
    await act(async () => {
      rerender(
        <StateRoot>
          <StoreHarness
            initialValues={initialValues}
            fs={fsE}
            onStores={(stores) => {
              captured = stores;
            }}
          />
        </StateRoot>,
      );
    });

    // Resolving old isSameEntry should hit stale generation guard without clobbering ProjectE
    await act(async () => {
      resolveSlowSameEntry(true);
    });
    expect(captured?.appState?.projectName).toBe('ProjectE');
  });
});
