import { RagState } from '@/components/AI/RagState';
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBar from './StatusBar';

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({ mode: 'local' })),
}));

vi.mock('@/components/AI/RagState', () => ({
  RagState: { useState: vi.fn(() => ({ status: 'idle' })) },
}));

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

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => <div data-tooltip={content}>{children}</div>,
}));

describe('StatusBar', () => {
  beforeEach(() => {
    useFileSystem.mockReturnValue({ mode: 'local' });
    RagState.useState.mockReturnValue({ status: 'idle' });
  });

  it('renders project name and filesystem mode', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({});
    TabState.useState.mockReturnValue({ activeTabId: null, openTabs: [] });

    render(<StatusBar />);

    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText('Local')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Storage: local folder' })).toBeDefined();
  });

  it('renders cursor position and language for active tab', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
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

  it('shows AI error state when completion fails for the active file', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({
      cursorPos: { 'file.js': { line: 1, col: 1 } },
      aiCompletionEnabled: true,
      isCompleting: {},
      aiCompletionDebug: {
        status: 'error',
        filePath: 'file.js',
        error: 'Model missing',
      },
    });
    TabState.useState.mockReturnValue({
      activeTabId: 'file.js',
      openTabs: [{ id: 'file.js', type: 'file' }],
    });

    render(<StatusBar />);

    expect(screen.getByText('AI Error')).toBeDefined();
  });

  it('shows what AI completion is doing while thinking', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({
      cursorPos: { 'file.js': { line: 1, col: 1 } },
      aiCompletionEnabled: true,
      isCompleting: { 'file.js': true },
      completionActivity: {
        'file.js': {
          status: 'thinking',
          phase: 'generating',
          model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
        },
      },
      aiCompletionDebug: {
        status: 'thinking',
        phase: 'generating',
        filePath: 'file.js',
        model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      },
    });
    TabState.useState.mockReturnValue({
      activeTabId: 'file.js',
      openTabs: [{ id: 'file.js', type: 'file' }],
    });

    const { container } = render(<StatusBar />);

    expect(screen.getByText('Thinking...')).toBeDefined();
    const tooltips = [...container.querySelectorAll('[data-tooltip]')].map((node) =>
      node.getAttribute('data-tooltip'),
    );
    expect(
      tooltips.some((tooltip) => tooltip?.includes('Generating completion with Qwen2.5-Coder-3B')),
    ).toBe(true);
    expect(tooltips.some((tooltip) => tooltip?.includes('Press Esc to cancel.'))).toBe(true);
  });

  it('shows RAG status when indexing is active', () => {
    RagState.useState.mockReturnValue({ status: 'indexing' });
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({});
    TabState.useState.mockReturnValue({ activeTabId: null, openTabs: [] });

    render(<StatusBar />);

    expect(screen.getByText('RAG: indexing')).toBeDefined();
  });

  it('renders virtual storage mode when not local', () => {
    useFileSystem.mockReturnValue({ mode: null });
    AppState.useState.mockReturnValue({
      theme: 'light',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({});
    TabState.useState.mockReturnValue({ activeTabId: null, openTabs: [] });

    render(<StatusBar />);

    expect(screen.getByText('Virtual')).toBeDefined();
    expect(
      screen.getByRole('status', { name: 'Storage: browser (virtual filesystem)' }),
    ).toBeDefined();
  });

  it.each([
    ['file.ts', 'TypeScript'],
    ['styles.css', 'CSS'],
    ['index.html', 'HTML'],
    ['data.json', 'JSON'],
    ['README.md', 'Markdown'],
    ['notes.txt', 'Plain Text'],
    ['preview', 'Preview', 'preview'],
    ['logs', 'System Log', 'logs'],
  ])('detects language for %s', (id, language, type = 'file') => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
      projectName: 'Test Project',
    });
    EditorState.useState.mockReturnValue({
      cursorPos: { [id]: { line: 1, col: 1 } },
    });
    TabState.useState.mockReturnValue({
      activeTabId: id,
      openTabs: [{ id, type }],
    });

    render(<StatusBar />);
    expect(screen.getByText(language)).toBeDefined();
  });
});
