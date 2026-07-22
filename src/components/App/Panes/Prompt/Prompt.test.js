import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import Settings from '@/components/Storage/Settings';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultAgentSessions,
  getActiveAgentSession,
  listAgentSessions,
} from './AgentSessions';
import Prompt from './Prompt';

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => {
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

vi.mock('@/components/AI/Processor', () => ({
  processAIResponse: vi.fn().mockResolvedValue(undefined),
}));

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
  const actual = await importOriginal();
  return {
    ...actual,
    AgentSessionState: {
      useState: vi.fn(() => {
        const updater = (fn) => {
          if (typeof fn === 'function') {
            const draft = {
              sessions: { ...mockAgentSessionStore.sessions },
              activeSessionId: mockAgentSessionStore.activeSessionId,
            };
            // Deep-ish clone sessions for draft mutation style used by Prompt
            for (const [id, session] of Object.entries(draft.sessions)) {
              draft.sessions[id] = { ...session, messages: [...(session.messages || [])] };
            }
            fn(draft);
            mockAgentSessionStore = {
              sessions: draft.sessions,
              activeSessionId: draft.activeSessionId,
            };
          }
        };
        return Object.assign(updater, mockAgentSessionStore);
      }),
    },
  };
});

const setupCommonMocks = ({ reasoning = '', isAIProcessing = false } = {}) => {
  mockAgentSessionStore = createDefaultAgentSessions();
  const active = getActiveAgentSession(mockAgentSessionStore);
  mockAgentSessionStore.sessions[active.id] = {
    ...active,
    reasoning,
  };

  SidebarState.useState.mockReturnValue({
    showAIInput: true,
    isAIInputPopupOpen: false,
  });
  const mockLogState = {
    isAIProcessing,
    isSystemProcessing: false,
    isProcessing: false,
    reasoning,
    logs: [],
  };
  LogState.useState.mockReturnValue(mockLogState);
  LogState.usePassiveState.mockReturnValue(
    Object.assign(
      vi.fn((fn) => typeof fn === 'function' && fn(mockLogState)),
      mockLogState,
    ),
  );
  TabState.useState.mockReturnValue(
    Object.assign(vi.fn(), {
      openTabs: [],
      activeTabId: null,
    }),
  );
  const mockAppState = { fs: {}, isMobile: false };
  AppState.useState.mockReturnValue(mockAppState);
  AppState.usePassiveState.mockReturnValue(mockAppState);
  EditorState.useState.mockReturnValue(vi.fn());
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
    expect(screen.getByLabelText('Agent sessions')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Single' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Team' })).toBeDefined();
    const modelDropdown = screen.getByRole('button', { name: /^model /i });
    expect(modelDropdown).toBeDefined();
    await act(async () => {
      fireEvent.pointerDown(modelDropdown);
      fireEvent.click(modelDropdown);
    });
    expect(screen.getByText(/Best coding model/)).toBeDefined();
    expect(screen.getByText('Recommended')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Cached')).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByText('Qwen2.5 Coder 3B'));
    });
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC');
  });

  it('opens the model manager and caches models', async () => {
    const webLLMAPI = await import('@/components/AI/WebLLMAPI');
    render(<Prompt />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Manage AI models'));
    });

    expect(screen.getByRole('heading', { name: 'AI Models' })).toBeDefined();
    expect(screen.getByText('Qwen2.5 Coder 7B')).toBeDefined();
    expect(screen.getByText(/Complex code edits/)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Cache' })[0]);
    });

    expect(webLLMAPI.cacheWebLLMModel).toHaveBeenCalled();
  });

  it('renders collapsed when showAIInput is false', async () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: false,
    });
    const { container } = render(<Prompt />);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
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
    expect(codeBlock.textContent).toContain('this-is-a-very-long-agent-output-line');
  });

  it('calls state update when form is submitted', async () => {
    const stateUpdate = vi.fn((fn) => {
      if (typeof fn === 'function') fn({ logs: [], isAIProcessing: false, reasoning: '' });
    });
    const mockLogState = Object.assign(stateUpdate, {
      isProcessing: false,
      isAIProcessing: false,
      logs: [],
    });
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);

    render(<Prompt />);
    const input = screen.getByPlaceholderText('Tell the Agent what to do...');
    const button = screen.getByTitle('Execute prompt');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'build app' } });
    });
    await waitFor(() => expect(button).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(button);
    });

    expect(stateUpdate).toHaveBeenCalled();
    expect(listAgentSessions(mockAgentSessionStore.sessions)[0].messages.length).toBeGreaterThan(0);
  });

  it('creates a new agent session from the manager', async () => {
    render(<Prompt />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('New session'));
    });
    expect(listAgentSessions(mockAgentSessionStore.sessions)).toHaveLength(2);
  });

  it('shows the role graph editor in team mode', async () => {
    const active = getActiveAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      mode: 'team',
    };
    render(<Prompt />);
    expect(screen.getByLabelText('Team role graph')).toBeDefined();
    expect(screen.getByText('Role graph')).toBeDefined();
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
});
