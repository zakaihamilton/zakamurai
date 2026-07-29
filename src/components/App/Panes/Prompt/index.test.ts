import { describe, expect, it, vi } from 'vitest';
import Prompt, { AgentSessionState, PromptState, PromptUiState } from './index';

vi.mock('./Prompt', () => ({
  default: 'mockPrompt',
  PromptState: 'mockPromptState',
  PromptUiState: 'mockPromptUiState',
}));

vi.mock('./AgentSessions', () => ({
  AgentSessionState: 'mockAgentSessionState',
  createDefaultAgentSessions: vi.fn(),
  createAgentSession: vi.fn(),
  listAgentSessions: vi.fn(),
}));

describe('Prompt index', () => {
  it('exports Prompt, PromptState, PromptUiState, and AgentSessionState', () => {
    expect(Prompt).toBe('mockPrompt');
    expect(PromptState).toBe('mockPromptState');
    expect(PromptUiState).toBe('mockPromptUiState');
    expect(AgentSessionState).toBe('mockAgentSessionState');
  });
});
