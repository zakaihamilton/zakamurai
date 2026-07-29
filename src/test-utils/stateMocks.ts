import type { ShortcutActionContext } from '@/components/App/types';
import type {
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  EditorStateShape,
  LogStateShape,
  PreviewStateShape,
  PreviewAreaUiStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  SidebarUiStateShape,
  TabStateShape,
} from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';
import { vi, type Mock } from 'vitest';

function createStoreInternals<T extends object>() {
  return {
    __monitor: vi.fn(),
    __unmonitor: vi.fn(),
    __monitored: [] as never[],
    __unique: 'mock',
    __id: undefined,
    __object: {} as T,
    __counter: 0,
    __string: 'mock',
    __node: undefined,
  };
}

/** Build a callable mock state store with snapshot properties. */
export function createMockStateStore<T extends object>(
  initial: T,
): StateStore<T> & Mock {
  const state = { ...initial };
  const updater = vi.fn((cb: (draft: Draft<T>) => void) => {
    const draft = structuredClone(state) as Draft<T>;
    cb(draft);
    Object.assign(state, draft);
  }) as StateStore<T> & Mock;
  Object.assign(updater, state, createStoreInternals<T>());
  return updater;
}

export function makeAppState(overrides: Partial<AppStateShape> = {}): StateStore<AppStateShape> & Mock {
  return createMockStateStore<AppStateShape>({
    theme: 'dark',
    projectName: 'My App',
    showShortcuts: false,
    showCompletionDebug: false,
    isResizing: false,
    isMobile: false,
    compileRequest: 0,
    silentCompileRequest: 0,
    ...overrides,
  });
}

export function makeSidebarState(
  overrides: Partial<SidebarStateShape> = {},
): StateStore<SidebarStateShape> & Mock {
  return createMockStateStore<SidebarStateShape>({
    isSidebarOpen: true,
    showAIInput: false,
    isSidebarPopupOpen: false,
    isAIInputPopupOpen: false,
    folderTree: [],
    sidebarWidth: 280,
    expandedFolders: {},
    ...overrides,
  });
}

export function makeSidebarUiState(
  overrides: Partial<SidebarUiStateShape> = {},
): StateStore<SidebarUiStateShape> & Mock {
  return createMockStateStore<SidebarUiStateShape>({
    filterText: '',
    loadingPaths: {},
    dropTargetPath: null,
    animatedWidth: 280,
    creatingAt: null,
    ...overrides,
  });
}

export function makeTabState(overrides: Partial<TabStateShape> = {}): StateStore<TabStateShape> & Mock {
  return createMockStateStore<TabStateShape>({
    openTabs: [],
    activeTabId: null,
    lastCodeTabId: null,
    ...overrides,
  });
}

export function makeEditorState(
  overrides: Partial<EditorStateShape> = {},
): StateStore<EditorStateShape> & Mock {
  return createMockStateStore<EditorStateShape>({
    fileContents: {},
    aiCompletionEnabled: true,
    isReadOnly: false,
    navigationHistory: { stack: [], currentIndex: -1 },
    pendingDiffs: {},
    pendingDeletions: {},
    ...overrides,
  });
}

export function makeLogState(overrides: Partial<LogStateShape> = {}): StateStore<LogStateShape> & Mock {
  return createMockStateStore<LogStateShape>({
    isSystemProcessing: false,
    isAIProcessing: false,
    logs: [],
    ...overrides,
  });
}

export function makeLogAreaUiState(
  overrides: Partial<import('@/components/state/domain-types').LogAreaUiStateShape> = {},
): StateStore<import('@/components/state/domain-types').LogAreaUiStateShape> & Mock {
  return createMockStateStore({
    copied: false,
    autoScroll: true,
    filterText: '',
    ...overrides,
  });
}

export function makePromptState(
  overrides: Partial<PromptStateShape> = {},
): StateStore<PromptStateShape> & Mock {
  return createMockStateStore<PromptStateShape>({
    promptWidth: 360,
    promptHistory: [],
    ...overrides,
  });
}

export function makePromptUiState(
  overrides: Partial<PromptUiStateShape> = {},
): StateStore<PromptUiStateShape> & Mock {
  return createMockStateStore<PromptUiStateShape>({
    val: '',
    historyIndex: -1,
    draftVal: '',
    isReasoningVisible: true,
    selectedModel: '',
    isModelManagerOpen: false,
    isRoleGraphOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: 360,
    abortController: null,
    promptScope: 'project',
    welcomeRequest: null,
    runningSessionId: null,
    isAgentTreeOpen: false,
    ...overrides,
  });
}

export function makeAgentSessionState(
  overrides: Partial<AgentSessionStateShape> = {},
): StateStore<AgentSessionStateShape> & Mock {
  return createMockStateStore<AgentSessionStateShape>({
    sessions: {},
    activeSessionId: null,
    ...overrides,
  });
}

export function makePreviewState(
  overrides: Partial<PreviewStateShape> = {},
): StateStore<PreviewStateShape> & Mock {
  return createMockStateStore<PreviewStateShape>({
    htmlContent: null,
    isCompilerReady: false,
    previewAddress: '/preview/dist/index.html',
    previewSessionId: null,
    containerStatus: 'idle',
    compileStatus: 'idle',
    compilePhase: null,
    lastCompileAt: null,
    containerError: null,
    ...overrides,
  });
}

export function makePreviewAreaUiState(
  overrides: Partial<PreviewAreaUiStateShape> = {},
): StateStore<PreviewAreaUiStateShape> & Mock {
  return createMockStateStore<PreviewAreaUiStateShape>({
    isLoading: false,
    scale: 1,
    error: null,
    refreshKey: 1,
    isSwReady: true,
    isMaximized: false,
    address: '/preview/',
    host: 'localhost',
    ...overrides,
  });
}

export function makeChangeSetState(
  overrides: Partial<ChangeSetStateShape> = {},
): StateStore<ChangeSetStateShape> & Mock {
  return createMockStateStore<ChangeSetStateShape>({
    activeId: null,
    items: [],
    ...overrides,
  });
}

export function makeWebLLMState(
  overrides: Partial<import('@/components/state/domain-types').WebLLMStateShape> = {},
): StateStore<import('@/components/state/domain-types').WebLLMStateShape> & Mock {
  return createMockStateStore({
    cachedModelIds: [],
    engines: {},
    activeModelId: null,
    ...overrides,
  });
}

export function makeWorkspaceHealthState(
  overrides: Partial<import('@/components/state/domain-types').WorkspaceHealthStateShape> = {},
): StateStore<import('@/components/state/domain-types').WorkspaceHealthStateShape> & Mock {
  return createMockStateStore({
    status: 'idle',
    error: null,
    totalFiles: 0,
    indexedFiles: 0,
    indexedBytes: 0,
    skippedFiles: [],
    lastIndexedAt: null,
    ...overrides,
  });
}

/** Minimal ShortcutActionContext for keyboard shortcut tests. */
export function makeShortcutActionContext(
  overrides: Partial<ShortcutActionContext> = {},
): ShortcutActionContext {
  return {
    appState: makeAppState(),
    sidebarState: makeSidebarState(),
    tabState: makeTabState(),
    editorState: makeEditorState(),
    logState: makeLogState(),
    ...overrides,
  };
}

/** Cast a vi.fn mock to a typed state hook for test setup. */
export function asStateHookMock<T extends object>(
  fn: Mock,
): Mock & ((...args: unknown[]) => StateStore<T> | undefined) {
  return fn;
}
