import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../App';
import { EditorState } from '../EditorArea';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
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

vi.mock('../App', () => ({
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
    expect(screen.getByTitle('Execute (Enter)')).toBeDefined();
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
    const button = screen.getByTitle('Execute (Enter)');

    fireEvent.change(input, { target: { value: 'build app' } });
    fireEvent.click(button);

    expect(stateUpdate).toHaveBeenCalled();
  });
});
