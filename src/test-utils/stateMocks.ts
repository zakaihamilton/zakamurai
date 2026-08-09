import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { ShortcutActionContext } from '@/components/App/types';
import type {
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  LogStateShape,
  PreviewAreaUiStateShape,
  PreviewStateShape,
  ProblemsStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  SidebarUiStateShape,
  TabStateShape,
} from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';
import { type Mock, vi } from 'vitest';

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
export function createMockStateStore<T extends object>(initial: T): StateStore<T> & Mock {
  const state = { ...initial };

  const syncProps = () => {
    for (const key of Object.keys(state) as (keyof T)[]) {
      (updater as Record<string, unknown>)[key as string] = state[key];
    }
  };

  const updater = vi.fn((cb: (draft: Draft<T>) => void) => {
    const draft = structuredClone(state) as Draft<T>;
    cb(draft);
    Object.assign(state, draft);
    syncProps();
  }) as StateStore<T> & Mock;

  Object.assign(updater, state, createStoreInternals<T>());
  syncProps();

  return new Proxy(updater, {
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in state) {
        (state as Record<string, unknown>)[prop] = value;
      }
      return Reflect.set(target, prop, value, receiver);
    },
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !prop.startsWith('__') && prop in state) {
        return (state as Record<string, unknown>)[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as StateStore<T> & Mock;
}

export function makeAppState(
  overrides: Partial<AppStateShape> = {},
): StateStore<AppStateShape> & Mock {
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

export function makeTabState(
  overrides: Partial<TabStateShape> = {},
): StateStore<TabStateShape> & Mock {
  return createMockStateStore<TabStateShape>({
    openTabs: [],
    activeTabId: null,
    lastCodeTabId: null,
    ...overrides,
  });
}

export function makeEditorState(
  overrides: Partial<ExtendedEditorState> = {},
): StateStore<ExtendedEditorState> & Mock {
  return createMockStateStore<ExtendedEditorState>({
    fileContents: {},
    aiCompletionEnabled: true,
    isReadOnly: false,
    navigationHistory: { stack: [], currentIndex: -1 },
    pendingDiffs: {},
    pendingDeletions: {},
    ...overrides,
  });
}

export function makeLogState(
  overrides: Partial<LogStateShape> = {},
): StateStore<LogStateShape> & Mock {
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
    welcomePrompt: '',
    selectedModel: '',
    isModelManagerOpen: false,
    cachedModelIds: [],
    modelCacheWork: null,
    modelCacheProgress: '',
    modelCacheError: '',
    animatedWidth: 360,
    abortController: null,
    promptScope: 'project',
    welcomeRequest: null,
    runningSessionId: null,
    stopRequest: 0,
    isAgentTreeOpen: false,
    latestManagerTrace: null,
    latestAIIncident: null,
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

export function makeProblemsState(
  overrides: Partial<ProblemsStateShape> = {},
): StateStore<ProblemsStateShape> & Mock {
  return createMockStateStore<ProblemsStateShape>({
    items: [],
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
    capabilityReport: null,
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
