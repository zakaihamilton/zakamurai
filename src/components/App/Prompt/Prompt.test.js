import { EditorState } from '@/components/App/EditorArea';
import { LogState } from '@/components/App/LogArea';
import { SidebarState } from '@/components/App/Sidebar';
import { TabState } from '@/components/App/TabBar';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../AppState';
import Prompt from './Prompt';

vi.mock('../LogArea', () => ({
  LogState: {
    useState: vi.fn(),
  },
}));

vi.mock('../../Widgets/Tooltip/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => {
    return React.cloneElement(children, { title: content });
  },
}));

vi.mock('../Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(),
  },
}));

vi.mock('../TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('../AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('../EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

vi.mock('../../AI', () => ({
  askWebLLM: vi.fn().mockResolvedValue('Mock response'),
  interruptWebLLM: vi.fn(),
  processAIResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../Storage/Settings', () => ({
  __esModule: true,
  default: {
    addPromptHistory: vi.fn(),
    getPromptHistory: vi.fn().mockReturnValue([]),
  },
}));

describe('Prompt', () => {
  it('renders input and button when showAIInput is true', () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    LogState.useState.mockReturnValue({
      isProcessing: false,
    });
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    AppState.useState.mockReturnValue({ fs: {} });
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
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(
      Object.assign(tabUpdate, {
        openTabs: [],
        activeTabId: null,
      }),
    );
    AppState.useState.mockReturnValue({ fs: {} });
    EditorState.useState.mockReturnValue(vi.fn());

    const { container } = render(<Prompt />);
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('calls state update when form is submitted', () => {
    const stateUpdate = vi.fn();
    LogState.useState.mockReturnValue(
      Object.assign(stateUpdate, {
        isProcessing: false,
        logs: [],
      }),
    );
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
    AppState.useState.mockReturnValue({ fs: {} });
    EditorState.useState.mockReturnValue(vi.fn());

    render(<Prompt />);
    const input = screen.getByPlaceholderText('Enter the AI prompt here...');
    const button = screen.getByTitle('Execute prompt');

    fireEvent.change(input, { target: { value: 'build app' } });
    fireEvent.click(button);

    expect(stateUpdate).toHaveBeenCalled();
  });
});
