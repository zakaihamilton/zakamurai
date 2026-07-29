import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import Settings from '@/components/Storage/Settings';
import type { AgentSessionStateShape } from '@/components/state/domain-types';
import { expectAgentSession } from '@/test-utils/agentSessionMocks';
import {
  makeAppState,
  makeLogState,
  makePromptState,
  makePromptUiState,
  makeSidebarState,
  makeTabState,
  makeWorkspaceHealthState,
} from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultAgentSessions,
  getActiveAgentSession,
  listAgentSessions,
} from './AgentSessions';
import Prompt from './Prompt';
import { PromptState, PromptUiState } from './PromptState';

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
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

vi.mock('@/components/AI/Processor', () => ({
  processAIResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/AI/Agent', () => ({
  collectWorkspaceFiles: vi.fn().mockResolvedValue({}),
  runAgent: vi.fn().mockResolvedValue({ summary: 'done', changes: [] }),
  runCollaborativeAgent: vi.fn().mockResolvedValue({ summary: 'done', changes: [] }),
  applyAgentChanges: vi.fn(() => ({ deletions: [], changeSet: null })),
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
    setPromptDraft: vi.fn(),
    getAILogs: vi.fn().mockReturnValue([]),
    getAIPromptModel: vi.fn((defaultValue) => defaultValue),
    setAIPromptModel: vi.fn(),
    getAIModelExpanded: vi.fn().mockReturnValue({}),
    setAIModelExpanded: vi.fn(),
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
    expect(screen.getByPlaceholderText('Tell the Agent what to do...')).toBeDefined();
    expect(screen.getByTitle('Execute prompt')).toBeDefined();
    expect(screen.getByLabelText('Active agent')).toBeDefined();
    expect(screen.getByLabelText('Open agent tree')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Single' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Team' })).toBeDefined();

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
    const { runAgent } = await import('@/components/AI/Agent');
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
    expect(listAgentSessions(mockAgentSessionStore.sessions)[0].messages).toHaveLength(1);
    await waitFor(() => expect(runAgent).toHaveBeenCalledOnce());
  });

  it('creates a new root agent from the tree manager', async () => {
    vi.mocked(PromptUiState.useState).mockReturnValue(makePromptUiState({ isAgentTreeOpen: true }));
    render(<Prompt />);
    await waitFor(() => expect(screen.getByLabelText('New agent')).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByLabelText('New agent'));
    });
    expect(listAgentSessions(mockAgentSessionStore.sessions)).toHaveLength(2);
  });

  it('suspends the tree dialog while a tree action dialog is open', async () => {
    const promptUi = makePromptUiState({ isAgentTreeOpen: true });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    const view = render(<Prompt />);
    await waitFor(() => expect(screen.getByLabelText('New agent')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rename Agent 1' }));
    });
    view.rerender(<Prompt />);
    await waitFor(() => expect(screen.getByText('Rename session')).toBeDefined());
    expect(screen.queryByRole('navigation', { name: 'Agent tree' })).toBeNull();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    view.rerender(<Prompt />);
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Agent tree' })).toBeDefined(),
    );
  });

  it('shows the role graph summary in team mode and opens the editor dialog', async () => {
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      mode: 'team',
    };
    const promptUi = makePromptUiState();
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    const view = render(<Prompt />);
    expect(screen.getByLabelText('Team role graph summary')).toBeDefined();
    expect(screen.getByText('Planner → Coder → Reviewer')).toBeDefined();
    expect(screen.queryByLabelText('Role graph editor')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit role graph'));
    });
    promptUi.isRoleGraphOpen = true;
    view.rerender(<Prompt />);
    expect(screen.getByLabelText('Role graph editor')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Team role graph' })).toBeDefined();
  });

  it('handles input keydown events correctly', async () => {
    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the Agent what to do...');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: '.', metaKey: true });
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    });
  });

  it('allows toggling reasoning visibility', async () => {
    setupCommonMocks({
      reasoning: 'Some reasoning text',
      isAIProcessing: true,
    });
    render(<Prompt />);

    const toggleBtn = screen.getByTitle('Hide Reasoning');
    expect(toggleBtn).toBeDefined();
    await act(async () => fireEvent.click(toggleBtn));
  });

  it('uses the mobile popup state instead of the desktop panel', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ showAIInput: false, isAIInputPopupOpen: true }),
    );
    render(<Prompt />);
    expect(screen.getByPlaceholderText('Tell the Agent what to do...')).toBeDefined();
  });

  it('shows compiling state and active file metadata', () => {
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
    expect(screen.getByText('App.js')).toBeDefined();
    expect(screen.getByText('Lines 2, 4')).toBeDefined();
  });

  it('sends welcome requests once an active session is available', async () => {
    const { runAgent } = await import('@/components/AI/Agent');
    const promptUi = makePromptUiState({
      welcomeRequest: { text: 'build a todo app', scope: 'project' },
    });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    render(<Prompt />);

    await waitFor(() => expect(runAgent).toHaveBeenCalled());
    expect(promptUi.welcomeRequest).toBeNull();
  });

  it('updates draft text while browsing history', async () => {
    const promptUi = makePromptUiState({ val: 'draft', historyIndex: -1, draftVal: '' });
    vi.mocked(PromptUiState.useState).mockReturnValue(promptUi);
    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the Agent what to do...');

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
    const input = screen.getByPlaceholderText('Agent is working... Please wait.');

    await act(async () => {
      fireEvent.keyDown(input, { key: '.', ctrlKey: true });
    });

    expect(interrupt).toHaveBeenCalled();
    Object.defineProperty(navigator, 'platform', { configurable: true, value: originalPlatform });
  });
});
