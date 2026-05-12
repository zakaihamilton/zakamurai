import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import StatusBar from './StatusBar';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

describe('StatusBar', () => {
  it('renders project name and filesystem mode', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
      fs: { mode: 'local' },
    });
    EditorState.useState.mockReturnValue({});
    TabState.useState.mockReturnValue({ activeTabId: null, openTabs: [] });

    render(<StatusBar />);

    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText('Local')).toBeDefined();
  });

  it('renders cursor position and language for active tab', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
      fs: { mode: 'local' },
    });
    EditorState.useState.mockReturnValue({
      cursorPos: { 'file.js': { line: 10, col: 5 } },
    });
    TabState.useState.mockReturnValue({
      activeTabId: 'file.js',
      openTabs: [{ id: 'file.js', type: 'file' }],
    });

    render(<StatusBar />);

    expect(screen.getByText(/Ln 10, Col 5/)).toBeDefined();
    expect(screen.getByText('JavaScript')).toBeDefined();
  });

  it('toggles AI completion when button is clicked', () => {
    const editorStateUpdater = vi.fn();
    const editorStateMock = Object.assign(editorStateUpdater, {
      aiCompletionEnabled: false,
      isCompleting: {},
    });

    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
      fs: { mode: 'local' },
    });
    EditorState.useState.mockReturnValue(editorStateMock);
    TabState.useState.mockReturnValue({
      activeTabId: 'file.js',
      openTabs: [{ id: 'file.js', type: 'file' }],
    });

    render(<StatusBar />);

    const aiButton = screen.getByRole('button', { name: /Turn AI completion on/i });
    fireEvent.click(aiButton);

    expect(editorStateUpdater).toHaveBeenCalled();
  });
});
