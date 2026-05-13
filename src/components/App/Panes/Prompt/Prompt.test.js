import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
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

vi.mock('@/components/AI', () => ({
  askWebLLM: vi.fn().mockResolvedValue('Mock response'),
  interruptWebLLM: vi.fn(),
  processAIResponse: vi.fn().mockResolvedValue(undefined),
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
  },
}));

describe('Prompt', () => {
  it('renders input and button when showAIInput is true', () => {
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
  });

  it('renders collapsed when showAIInput is false', () => {
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
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
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
