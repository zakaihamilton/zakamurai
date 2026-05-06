import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import { AppState } from '../App';
import { EditorState } from '../EditorArea';
import PromptFooter from './PromptFooter';

vi.mock('../LogArea', () => ({
  LogState: {
    useState: vi.fn(),
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

describe('PromptFooter', () => {
  it('renders input and button when showAIInput is true', () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: true,
    });
    LogState.useState.mockReturnValue({
      isProcessing: false,
    });
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(Object.assign(tabUpdate, {
      openTabs: [],
      activeTabId: null
    }));
    AppState.useState.mockReturnValue({ fs: {} });
    EditorState.useState.mockReturnValue(vi.fn());

    render(<PromptFooter />);
    expect(screen.getByPlaceholderText('Enter the AI prompt here...')).toBeDefined();
    expect(screen.getByTitle('Execute')).toBeDefined();
  });

  it('does not render when showAIInput is false', () => {
    SidebarState.useState.mockReturnValue({
      showAIInput: false,
    });
    LogState.useState.mockReturnValue(vi.fn());
    const tabUpdate = vi.fn();
    TabState.useState.mockReturnValue(Object.assign(tabUpdate, {
      openTabs: [],
      activeTabId: null
    }));
    AppState.useState.mockReturnValue({ fs: {} });
    EditorState.useState.mockReturnValue(vi.fn());

    const { container } = render(<PromptFooter />);
    expect(container.firstChild).toBeNull();
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
    TabState.useState.mockReturnValue(Object.assign(tabUpdate, {
      openTabs: [],
      activeTabId: null
    }));
    AppState.useState.mockReturnValue({ fs: {} });
    EditorState.useState.mockReturnValue(vi.fn());

    render(<PromptFooter />);
    const input = screen.getByPlaceholderText('Enter the AI prompt here...');
    const button = screen.getByTitle('Execute');

    fireEvent.change(input, { target: { value: 'build app' } });
    fireEvent.click(button);

    expect(stateUpdate).toHaveBeenCalled();
  });
});
