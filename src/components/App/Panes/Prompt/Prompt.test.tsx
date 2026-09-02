import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { expectAgentSession } from '@/test-utils/agentSessionMocks';
import {
  makeAppState,
  makeEditorState,
  makeLogState,
  makePromptState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
  makeWorkspaceHealthState,
} from '@/test-utils/stateMocks';
import type { AgentSessionStateShape, TreeNode } from '@/types/domain-types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAgentSessions, listAgentSessions } from './AgentSessions';
import Prompt from './Prompt';
import { PromptState, PromptUiState } from './PromptState';

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/utils/compiler', () => ({
  Compiler: vi.fn().mockImplementation(() => ({
    compile: vi.fn().mockResolvedValue(undefined),
    runProjectCheck: vi.fn().mockResolvedValue('ok'),
  })),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({
    children,
    content,
  }: { children: ReactElement<{ title?: ReactNode }>; content: ReactNode }) => {
    return React.cloneElement(children, { title: content });
  },
}));

vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/AI/WebLLMState', () => ({
  WebLLMState: {
    useState: vi.fn(() => ({ cachedModelIds: ['Qwen3.5-4B-q4f16_1-MLC'] })),
    usePassiveState: vi.fn(() =>
      Object.assign(vi.fn(), { cachedModelIds: ['Qwen3.5-4B-q4f16_1-MLC'] }),
    ),
  },
}));
vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({})),
}));
vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('./PromptState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./PromptState')>();
  return {
    ...actual,
    PromptState: {
      useState: vi.fn(),
      usePassiveState: vi.fn(),
    },
    PromptUiState: {
      useState: vi.fn(),
      usePassiveState: vi.fn(),
    },
  };
});

const {
  runAgent,
  runManager,
  applyAgentChanges,
  collectWorkspaceFiles,
  ensureFileInTree,
  removeFileFromTree,
} = vi.hoisted(() => ({
  collectWorkspaceFiles: vi.fn().mockResolvedValue({}),
  runAgent: vi.fn().mockResolvedValue({ summary: 'done', changes: [] }),
  runManager: vi.fn().mockResolvedValue({ summary: 'done', changes: [] }),
  applyAgentChanges: vi.fn(() => ({ deletions: [], changeSet: null })),
  ensureFileInTree: vi.fn(),
  removeFileFromTree: vi.fn(),
}));

vi.mock('@/components/AI/Agent', () => ({
  collectWorkspaceFiles,
  runAgent,
  runManager,
  applyAgentChanges,
  ensureFileInTree,
  removeFileFromTree,
}));

vi.mock('@/components/AI/Agent/Applier', () => ({ applyAgentChanges }));
vi.mock('@/components/AI/Agent/ManagerRunner', () => ({ runManager }));
vi.mock('@/components/AI/Agent/Snapshot', () => ({ collectWorkspaceFiles }));
vi.mock('@/components/AI/Agent/AIIncident', () => ({
  createAIIncident: vi.fn(() => ({ id: 'incident-test' })),
}));

vi.mock('@/components/Workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Workspace')>();
  const changeSetStore = Object.assign(vi.fn(), { activeId: null, items: [] });
  return {
    ...actual,
    ChangeSetState: {
      useState: vi.fn(() => changeSetStore),
      usePassiveState: vi.fn(() => changeSetStore),
    },
    WorkspaceHealthState: {
      useState: vi.fn(() => makeWorkspaceHealthState({ status: 'idle' })),
      usePassiveState: vi.fn(() => makeWorkspaceHealthState({ status: 'idle' })),
    },
    getWorkspaceIndex: () => ({ queryText: vi.fn().mockResolvedValue([]) }),
  };
});

vi.mock('@/components/AI/WebLLMAPI', () => ({
  askWebLLM: vi.fn().mockResolvedValue('Mock response'),
  cacheWebLLMModel: vi.fn().mockResolvedValue(undefined),
  deleteCachedWebLLMModel: vi.fn().mockResolvedValue(undefined),
  getCachedWebLLMModelIds: vi.fn().mockResolvedValue(['Qwen3.5-4B-q4f16_1-MLC']),
  interruptWebLLM: vi.fn(),
}));

vi.mock('@/utils/rag/search-utility', () => ({
  ragSearch: {
    retrieveContext: vi.fn().mockResolvedValue([]),
    formatPromptContext: vi.fn().mockReturnValue(''),
    init: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/components/Storage/Settings', () => ({
  __esModule: true,
  default: {
    addPromptHistory: vi.fn(),
    getPromptHistory: vi.fn().mockReturnValue([]),
    getPromptDraft: vi.fn().mockReturnValue(''),
    getWelcomePromptDraft: vi.fn().mockReturnValue(''),
    setPromptDraft: vi.fn(),
    getAILogs: vi.fn().mockReturnValue([]),
    getAIPromptModel: vi.fn((defaultValue) => defaultValue),
    setAIPromptModel: vi.fn(),
    getAIModelExpanded: vi.fn().mockReturnValue({}),
    setAIModelExpanded: vi.fn(),
    saveRecoveryCheckpoint: vi.fn().mockResolvedValue(true),
    getRecoveryCheckpoint: vi.fn().mockReturnValue(null),
  },
}));

let mockAgentSessionStore = createDefaultAgentSessions();

vi.mock('./AgentSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./AgentSessions')>();
  return {
    ...actual,
    AgentSessionState: {
      useState: vi.fn(() => {
        const updater = vi.fn((fn: (draft: AgentSessionStateShape) => void) => {
          const draft: AgentSessionStateShape = {
            sessions: { ...mockAgentSessionStore.sessions },
            activeSessionId: mockAgentSessionStore.activeSessionId,
          };
          for (const [id, session] of Object.entries(draft.sessions)) {
            draft.sessions[id] = { ...session, messages: [...session.messages] };
          }
          fn(draft);
          mockAgentSessionStore = {
            sessions: draft.sessions,
            activeSessionId: draft.activeSessionId,
          };
        });
        return Object.assign(updater, mockAgentSessionStore);
      }),
    },
  };
});

const setupCommonMocks = ({ reasoning = '', isAIProcessing = false } = {}) => {
  mockAgentSessionStore = createDefaultAgentSessions();
  const active = expectAgentSession(mockAgentSessionStore);
  mockAgentSessionStore.sessions[active.id] = {
    ...active,
    reasoning,
  };

  vi.mocked(SidebarState.useState).mockReturnValue(
    makeSidebarState({ showAIInput: true, isAIInputPopupOpen: false }),
  );
  const mockLogState = makeLogState({ isAIProcessing, reasoning });
  vi.mocked(LogState.useState).mockReturnValue(mockLogState);
  vi.mocked(LogState.usePassiveState).mockReturnValue(mockLogState);
  vi.mocked(TabState.useState).mockReturnValue(makeTabState({ openTabs: [], activeTabId: null }));
  const mockAppState = makeAppState({ isMobile: false });
  vi.mocked(AppState.useState).mockReturnValue(mockAppState);
  vi.mocked(AppState.usePassiveState).mockReturnValue(mockAppState);
  vi.mocked(EditorState.useState).mockReturnValue(
    vi.fn() as unknown as ReturnType<typeof EditorState.useState>,
  );
  vi.mocked(PromptState.useState).mockReturnValue(makePromptState());
  vi.mocked(PromptUiState.useState).mockReturnValue(
    makePromptUiState({ val: 'hello', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
  );
};

describe('Prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it('renders input and button when showAIInput is true', async () => {
    render(<Prompt />);
    expect(screen.getByPlaceholderText('Tell the AI Manager what to do...')).toBeDefined();
    expect(screen.getByTitle('Execute prompt')).toBeDefined();
    expect(screen.getByLabelText('Active conversation')).toBeDefined();
    expect(screen.getByLabelText('Open conversation history')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'AI Manager' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Single' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();

    const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(modelSelect).toBeDefined();
    await act(async () => {
      fireEvent.change(modelSelect, {
        target: { value: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC' },
      });
    });
    expect(modelSelect.value).toBe('Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC');
  });

  it('shows selected model download progress in Progress & Reasoning', () => {
    const webLLMStore = Object.assign(vi.fn(), {
      cachedModelIds: [],
      engines: {
        'Qwen3.5-4B-q4f16_1-MLC': {
          status: 'downloading',
          progressText: 'Fetching parameters: 50%',
        },
      },
    });
    vi.mocked(WebLLMState.useState).mockReturnValue(
      webLLMStore as unknown as ReturnType<typeof WebLLMState.useState>,
    );

    render(<Prompt />);

    const downloadStatus = screen.getByRole('status');
    expect(downloadStatus).toHaveTextContent('Downloading Qwen3.5 4B — Fetching parameters: 50%');
    expect(downloadStatus.closest('[class*="reasoningContent"]')).toContainElement(downloadStatus);
  });

  it('opens the model manager and caches models', async () => {
    const webLLMAPI = await import('@/components/AI/WebLLMAPI');
    vi.mocked(PromptUiState.useState).mockReturnValue(
      makePromptUiState({ isModelManagerOpen: true, selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
    );
    render(<Prompt />);

    expect(screen.getByRole('heading', { name: 'AI Models' })).toBeDefined();
    expect(screen.getByText('Qwen2.5 Coder 7B')).toBeDefined();
    expect(screen.getByText(/Complex code edits/)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Cache model' })[0]);
    });

    expect(webLLMAPI.cacheWebLLMModel).toHaveBeenCalled();
  });

  it('renders collapsed when showAIInput is false', async () => {
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    const { container } = render(<Prompt />);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders reasoning as markdown', () => {
    setupCommonMocks({
      reasoning: '## Plan\n\n- **bold step**\n\n```js\nconst ready = true;\n```',
      isAIProcessing: true,
    });
    render(<Prompt />);

    expect(screen.getByRole('heading', { name: 'Plan' })).toBeDefined();
    expect(screen.getByText('bold step').tagName).toBe('STRONG');
    expect(screen.getByText('const ready = true;').tagName).toBe('CODE');
  });

  it('opens Progress & Reasoning in a tab when a welcome request is handed off', async () => {
    const tabState = makeTabState({ openTabs: [], activeTabId: null });
    vi.mocked(TabState.useState).mockReturnValue(tabState);
    vi.mocked(PromptUiState.useState).mockReturnValue(
      makePromptUiState({
        val: '',
        selectedModel: 'Qwen3.5-4B-q4f16_1-MLC',
        welcomeRequest: { text: 'Build a landing page', scope: 'project' },
      }),
    );

    render(<Prompt />);

    await waitFor(() => expect(tabState.activeTabId).toBe('ai-section:reasoning'));
    expect(tabState.openTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ai-section:reasoning', label: 'Progress & Reasoning' }),
      ]),
    );
  });

  it('wraps long reasoning code blocks inside the prompt pane', () => {
    setupCommonMocks({
      reasoning: '```text\nthis-is-a-very-long-agent-output-line-without-natural-breaks\n```',
      isAIProcessing: true,
    });
    const { container } = render(<Prompt />);
    const codeBlock = container.querySelector('pre code');

    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.textContent).toContain('this-is-a-very-long-agent-output-line');
  });

  it('calls state update when form is submitted', async () => {
    const { runManager } = await import('@/components/AI/Agent');
    const mockLogState = makeLogState({ isAIProcessing: false });
    vi.mocked(LogState.useState).mockReturnValue(mockLogState);
    vi.mocked(LogState.usePassiveState).mockReturnValue(mockLogState);
    vi.mocked(PromptUiState.useState).mockReturnValue(
      makePromptUiState({ val: 'build app', selectedModel: 'Qwen3.5-4B-q4f16_1-MLC' }),
    );

    render(<Prompt />);
    const button = screen.getByTitle('Execute prompt');

    await waitFor(() => expect(button).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockLogState).toHaveBeenCalled();
    expect(
      listAgentSessions(mockAgentSessionStore.sessions)[0].messages.length,
    ).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(runManager).toHaveBeenCalledOnce());
  });

  it('creates a new root conversation from the history manager', async () => {
    vi.mocked(PromptUiState.useState).mockReturnValue(makePromptUiState({ isAgentTreeOpen: true }));
    render(<Prompt />);
    await waitFor(() => expect(screen.getByLabelText('New conversation')).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByLabelText('New conversation'));
    });
    expect(listAgentSessions(mockAgentSessionStore.sessions)).toHaveLength(2);
  });

  it('suspends the tree dialog while a tree action dialog is open', async () => {
    const promptUi = makePromptUiState({ isAgentTreeOpen: true });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    const view = render(<Prompt />);
    await waitFor(() => expect(screen.getByLabelText('New conversation')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rename Session 1' }));
    });
    view.rerender(<Prompt />);
    await waitFor(() => expect(screen.getByText('Rename session')).toBeDefined());
    expect(screen.queryByRole('navigation', { name: 'Conversation history' })).toBeNull();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    view.rerender(<Prompt />);
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Conversation history' })).toBeDefined(),
    );
  });

  it('does not expose team or role graph controls', () => {
    render(<Prompt />);
    expect(screen.queryByText('Planner → Coder → Reviewer')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Team role graph' })).toBeNull();
  });

  it('handles input keydown events correctly', async () => {
    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the AI Manager what to do...');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: '.', metaKey: true });
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    });
  });

  it('uses the mobile popup state instead of the desktop panel', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ showAIInput: false, isAIInputPopupOpen: true }),
    );
    render(<Prompt />);
    expect(screen.getByPlaceholderText('Tell the AI Manager what to do...')).toBeDefined();
  });

  it('shows compiling state without a context pane', () => {
    vi.mocked(LogState.useState).mockReturnValue(
      makeLogState({ isAIProcessing: false, isSystemProcessing: true }),
    );
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: 'src/App.js',
        openTabs: [{ id: 'src/App.js', type: 'file', label: 'App.js' }],
      }),
    );
    vi.mocked(PromptUiState.useState).mockReturnValue(makePromptUiState({ promptScope: 'file' }));
    const editorStore = Object.assign(vi.fn(), { selectedLines: { 'src/App.js': [2, 4] } });
    vi.mocked(EditorState.useState).mockReturnValue(
      editorStore as unknown as ReturnType<typeof EditorState.useState>,
    );
    render(<Prompt />);
    expect(screen.getAllByText('Compiling').length).toBeGreaterThan(0);
    expect(screen.queryByText('Context')).toBeNull();
    expect(screen.queryByText('App.js')).toBeNull();
    expect(screen.queryByText('Lines 2, 4')).toBeNull();
  });

  it('opens /file selection and arms the chosen file for one prompt', async () => {
    const promptUi = makePromptUiState({ val: '' });
    const editorStore = makeEditorState({
      fileContents: {
        'src/App.tsx': 'export default function App() {}',
        'src/main.tsx': 'import App from "./App";',
      },
    });
    const tabs = makeTabState();
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({
        folderTree: [
          {
            name: 'src',
            type: 'folder',
            children: [{ name: 'raw.ts', type: 'file' }],
          },
        ] as unknown as TreeNode[],
      }),
    );
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    vi.mocked(EditorState.useState).mockReturnValue(editorStore);
    vi.mocked(TabState.useState).mockReturnValue(tabs);

    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the AI Manager what to do...');

    await act(async () => {
      fireEvent.change(input, { target: { value: '/file Update the component' } });
    });

    expect(screen.getByRole('heading', { name: 'Select a file for this prompt' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'src/raw.ts' })).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'src/App.tsx' }));
    });

    expect(tabs.activeTabId).toBe('src/App.tsx');
    expect(tabs.openTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'src/App.tsx', type: 'file', label: 'App.tsx' }),
      ]),
    );
    expect(promptUi.val).toBe('Update the component');
    expect(promptUi.promptScope).toBe('file');
    expect(screen.queryByRole('heading', { name: 'Select a file for this prompt' })).toBeNull();
  });

  it('sends welcome requests once an active session is available', async () => {
    const promptUi = makePromptUiState({
      welcomeRequest: { text: 'build a todo app', scope: 'project' },
    });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    await act(async () => {
      render(
        <React.StrictMode>
          <Prompt />
        </React.StrictMode>,
      );
    });

    await waitFor(() => expect(runManager).toHaveBeenCalled());
    expect(runManager).toHaveBeenCalledTimes(1);
    expect(promptUi.welcomeRequest).toBeNull();
  });

  it('updates draft text while browsing history', async () => {
    const promptUi = makePromptUiState({ val: 'draft', historyIndex: -1, draftVal: '' });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the AI Manager what to do...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'updated draft' } });
    });

    expect(promptUi.draftVal).toBe('updated draft');
  });

  it('stops generation with Ctrl+. on non-Mac platforms', async () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
    const interrupt = (await import('@/components/AI/WebLLMAPI')).interruptWebLLM;
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ showAIInput: true, isAIInputPopupOpen: false }),
    );
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: true }));
    render(<Prompt />);
    const input = screen.getByPlaceholderText('AI Manager is working... Please wait.');

    await act(async () => {
      fireEvent.keyDown(input, { key: '.', ctrlKey: true });
    });

    expect(interrupt).toHaveBeenCalled();
    Object.defineProperty(navigator, 'platform', { configurable: true, value: originalPlatform });
  });
});
