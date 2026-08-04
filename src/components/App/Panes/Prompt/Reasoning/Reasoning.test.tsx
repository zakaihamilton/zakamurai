import { expectAgentSession } from '@/test-utils/agentSessionMocks';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAgentRunUsage, createDefaultAgentSessions } from '../AgentSessions';
import ReasoningPanel from './Reasoning';

vi.mock('../Prompt', () => ({
  PromptUiState: {
    useState: vi.fn(),
  },
}));

let mockAgentSessionStore = createDefaultAgentSessions();

vi.mock('../AgentSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../AgentSessions')>();
  return {
    ...actual,
    AgentSessionState: {
      useState: vi.fn(() => Object.assign(vi.fn(), mockAgentSessionStore)),
    },
  };
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('ReasoningPanel', () => {
  const setSessionReasoning = (reasoning: string) => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = { ...active, reasoning };
  };

  const setSessionUsage = () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      runUsage: {
        ...createAgentRunUsage(),
        modelIds: ['Qwen3.5-4B-q4f16_1-MLC'],
        modelCalls: 3,
        outcomes: { success: 2, error: 1, aborted: 0 },
        totalMs: 1250,
        toolCalls: { read_file: 2, write_file: 1 },
      },
    };
  };

  it('renders reasoning title and text correctly', () => {
    setSessionReasoning('This is some **Markdown** content');

    render(<ReasoningPanel />);

    expect(screen.getByText('Progress & Reasoning')).toBeDefined();
    expect(screen.getByText('Markdown')).toBeDefined();
  });

  it('renders the session transcript inside Progress & Reasoning', () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      reasoning: 'Reasoning after transcript',
      messages: [
        { id: 1, role: 'user', text: 'Build the app', timestamp: '10:00:00' },
        { id: 2, role: 'ai', text: 'I am on it', timestamp: '10:00:01' },
      ],
    };

    render(<ReasoningPanel />);

    expect(screen.queryByRole('heading', { name: 'Transcript' })).toBeNull();
    expect(screen.getByText('Build the app')).toBeDefined();
    expect(screen.getByText('I am on it')).toBeDefined();
    expect(screen.getByText('Build the app').closest('article')?.textContent).toContain(
      '10:00:00 · You',
    );
    const transcript = screen.getByText('Build the app');
    const reasoning = screen.getByText('Reasoning after transcript');
    expect(transcript.compareDocumentPosition(reasoning) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('shows the latest manager error after the reasoning content', () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      reasoning: 'The model could not complete the requested action.',
      status: 'error',
      messages: [
        { id: 1, role: 'user', text: 'Create the app', timestamp: '10:00:00' },
        {
          id: 2,
          role: 'ai',
          text: 'AI Manager error: The local model stopped responding.',
          timestamp: '10:00:05',
        },
      ],
    };

    render(<ReasoningPanel />);

    const reasoning = screen.getByText('The model could not complete the requested action.');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Latest error');
    expect(error).toHaveTextContent('The local model stopped responding.');
    expect(error).not.toHaveTextContent('AI Manager error:');
    expect(screen.queryByText(/AI Manager error:/)).toBeNull();
    expect(reasoning.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('shows the latest error at the end of the scrollable log', () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      reasoning: `${'Step complete.\n'.repeat(40)}Final step.`,
      status: 'error',
      messages: [
        {
          id: 1,
          role: 'ai',
          text: 'AI Manager error: Validation failed after 3 repair attempts.',
          timestamp: '10:00:05',
        },
      ],
    };

    const { container } = render(<ReasoningPanel />);
    const error = screen.getByRole('alert');
    const scrollRegion = container.querySelector('[class*="reasoningContent"]');
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion?.contains(error)).toBe(true);
    expect(scrollRegion?.lastElementChild).toBe(error);
  });

  it('clears a previous error while a new model run is active', () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      status: 'running',
      messages: [
        {
          id: 1,
          role: 'ai',
          text: 'AI Manager error: The previous run failed.',
          timestamp: '10:00:00',
        },
      ],
    };

    render(<ReasoningPanel />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('provides a custom-tooltip clear-log button', () => {
    const onClearLog = vi.fn();
    setSessionReasoning('Old reasoning');

    render(<ReasoningPanel onClearLog={onClearLog} />);

    const clearButton = screen.getByRole('button', { name: 'Clear AI Model log' });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);

    expect(onClearLog).toHaveBeenCalledOnce();
  });

  it('copies reasoning to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    setSessionReasoning('Copied content text');

    render(<ReasoningPanel />);

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copied content text');

    await waitFor(() => {
      expect(copyButton.getAttribute('aria-label')).toBe('Copied to clipboard');
    });
  });

  it('shows model, outcome, duration, and tool diagnostics for a completed run', () => {
    setSessionUsage();

    render(<ReasoningPanel />);

    expect(screen.getByText('Run diagnostics')).toBeDefined();
    expect(screen.getByText('Qwen3.5-4B-q4f16_1-MLC')).toBeDefined();
    expect(screen.getByText('1.3 s')).toBeDefined();
    expect(screen.getByText('read_file ×2 · write_file ×1')).toBeDefined();
  });

  it('toggles auto-scroll on and off from the toolbar', () => {
    setSessionReasoning('Scrolling log content');
    const scrollTo = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;

    try {
      render(<ReasoningPanel />);

      const toggle = screen.getByRole('button', { name: 'Turn auto-scroll off' });
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(scrollTo).toHaveBeenCalled();

      scrollTo.mockClear();
      fireEvent.click(toggle);

      expect(
        screen.getByRole('button', { name: 'Turn auto-scroll on' }).getAttribute('aria-pressed'),
      ).toBe('false');
      expect(scrollTo).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Turn auto-scroll on' }));
      expect(
        screen.getByRole('button', { name: 'Turn auto-scroll off' }).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(scrollTo).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('toggles per-step model input/output and includes the visible setting in copies', async () => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = expectAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = {
      ...active,
      reasoning: 'Step 1 completed',
      reasoningEvents: [
        {
          text: 'Step 1 completed',
          timestamp: '10:00:00',
          turn: 1,
          input: 'model input payload',
          output: 'model output payload',
        },
      ],
    };
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    render(<ReasoningPanel />);

    expect(screen.queryByText('model input payload')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show input/output for each agent step' });
    fireEvent.click(toggle);
    expect(screen.getByText('model input payload')).toBeDefined();
    expect(screen.getByText('model output payload')).toBeDefined();

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' });
    fireEvent.click(copyButton);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('model input payload'),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide input/output for each agent step' }));
    expect(screen.queryByText('model input payload')).toBeNull();
  });
});
