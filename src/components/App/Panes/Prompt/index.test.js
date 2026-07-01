import { describe, expect, it, vi } from 'vitest';
import Prompt, { PromptState, PromptUiState } from './index';

vi.mock('./Prompt', () => ({
  default: 'mockPrompt',
  PromptState: 'mockPromptState',
  PromptUiState: 'mockPromptUiState',
}));

describe('Prompt index', () => {
  it('exports Prompt, PromptState, and PromptUiState', () => {
    expect(Prompt).toBe('mockPrompt');
    expect(PromptState).toBe('mockPromptState');
    expect(PromptUiState).toBe('mockPromptUiState');
  });
});
