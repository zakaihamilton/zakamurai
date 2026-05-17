import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import Settings from '@/components/Storage/Settings';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import Prompt from './Prompt';

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    useState: vi.fn(),
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
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
  getCachedWebLLMModelIds: vi.fn().mockResolvedValue(['Phi-4-mini-instruct-q4f16_1-MLC']),
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
    getAILogs: vi.fn().mockReturnValue([]),
    getAIPromptModel: vi.fn((defaultValue) => defaultValue),
    setAIPromptModel: vi.fn(),
  },
}));

describe('Prompt', () => {
  it('renders input and button when showAIInput is true', async () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    const mockLogState = { isProcessing: false };
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {} };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    render(<Prompt />);
    expect(screen.getByPlaceholderText('Enter the AI prompt here...')).toBeDefined();
    expect(screen.getByTitle('Execute prompt')).toBeDefined();
    const modelDropdown = screen.getByRole('button', { name: /^model /i });
    expect(modelDropdown).toBeDefined();
    await act(async () => {
      fireEvent.pointerDown(modelDropdown);
      fireEvent.click(modelDropdown);
    });
    expect(screen.getByText(/Best code quality/)).toBeDefined();
    expect(screen.getByText('Recommended')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Cached')).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getByText('Qwen3 4B'));
    });
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen3-4B-q4f16_1-MLC');
  });

  it('opens the model manager and caches models', async () => {
    const webLLMAPI = await import('@/components/AI/WebLLMAPI');
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    const mockLogState = { isAIProcessing: false, isSystemProcessing: false, reasoning: '' };
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {}, isMobile: false };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    render(<Prompt />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Manage AI models'));
    });

    expect(screen.getByRole('heading', { name: 'AI Models' })).toBeDefined();
    expect(screen.getByText('Qwen2.5 Coder 7B')).toBeDefined();
    expect(screen.getByText(/Best code quality/)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getAllByText('Cache')[0]);
    });

    expect(webLLMAPI.cacheWebLLMModel).toHaveBeenCalled();
  });

  it('renders collapsed when showAIInput is false', async () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: false,
    });
    LogState.useState.mockReturnValue(vi.fn());
    LogState.usePassiveState.mockReturnValue(vi.fn());
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {} };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    const { container } = render(<Prompt />);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders reasoning as markdown', () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    const mockLogState = {
      isAIProcessing: true,
      isSystemProcessing: false,
      reasoning: '## Plan\n\n- **bold step**\n\n```js\nconst ready = true;\n```',
    };
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {}, isMobile: false };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    render(<Prompt />);

    expect(screen.getByRole('heading', { name: 'Plan' })).toBeDefined();
    expect(screen.getByText('bold step').tagName).toBe('STRONG');
    expect(screen.getByText('const ready = true;').tagName).toBe('CODE');
  });

  it('wraps long reasoning code blocks inside the prompt pane', () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    const mockLogState = {
      isAIProcessing: true,
      isSystemProcessing: false,
      reasoning: '```text\nthis-is-a-very-long-agent-output-line-without-natural-breaks\n```',
    };
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {}, isMobile: false };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    const { container } = render(<Prompt />);
    const codeBlock = container.querySelector('pre code');

    expect(codeBlock).not.toBeNull();
    expect(codeBlock.textContent).toContain('this-is-a-very-long-agent-output-line');
  });

  it('calls state update when form is submitted', async () => {
    const stateUpdate = vi.fn();
    const mockLogState = Object.assign(stateUpdate, {
      isProcessing: false,
      logs: [],
    });
    LogState.useState.mockReturnValue(mockLogState);
    LogState.usePassiveState.mockReturnValue(mockLogState);
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    const mockAppState = { fs: {} };
    AppState.useState.mockReturnValue(mockAppState);
    AppState.usePassiveState.mockReturnValue(mockAppState);
    EditorState.useState.mockReturnValue(vi.fn());

    render(<Prompt />);
    const input = screen.getByPlaceholderText('Enter the AI prompt here...');
    const button = screen.getByTitle('Execute prompt');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'build app' } });
    });
    await waitFor(() => expect(button).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(button);
    });

    expect(stateUpdate).toHaveBeenCalled();
  });
});
