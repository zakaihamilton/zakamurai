import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAgentSessions, getActiveAgentSession } from '../AgentSessions';
import ReasoningPanel from './ReasoningPanel';

vi.mock('../Prompt', () => ({
  PromptUiState: {
    useState: vi.fn(),
  },
}));

let mockAgentSessionStore = createDefaultAgentSessions();

vi.mock('../AgentSessions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    AgentSessionState: {
      useState: vi.fn(() => Object.assign(vi.fn(), mockAgentSessionStore)),
    },
  };
});

import { PromptUiState } from '../Prompt';

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('ReasoningPanel', () => {
  const setSessionReasoning = (reasoning) => {
    mockAgentSessionStore = createDefaultAgentSessions();
    const active = getActiveAgentSession(mockAgentSessionStore);
    mockAgentSessionStore.sessions[active.id] = { ...active, reasoning };
  };

  it('renders reasoning title and text correctly', () => {
    setSessionReasoning('This is some **Markdown** content');
    PromptUiState.useState.mockReturnValue({ isReasoningVisible: true });

    render(<ReasoningPanel />);

    expect(screen.getByText('Progress & Reasoning')).toBeDefined();
    expect(screen.getByText('Markdown')).toBeDefined();
  });

  it('copies reasoning to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    setSessionReasoning('Copied content text');
    PromptUiState.useState.mockReturnValue({ isReasoningVisible: true });

    render(<ReasoningPanel />);

    const copyButton = screen.getByRole('button');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copied content text');

    await waitFor(() => {
      expect(copyButton.className).toMatch(/copySuccess/);
    });
  });
});
