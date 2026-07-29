import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInitialPromptSelectedModel, getInitialPromptUiState } from './PromptState';

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    getAIPromptModel: vi.fn(),
    getPromptDraft: vi.fn(),
  },
}));

vi.mock('@/components/AI/WebLLMModels', () => ({
  RECOMMENDED_WEB_LLM_MODEL: { id: 'recommended-model' },
  resolveWebLLMModelId: vi.fn((id) => id || 'recommended-model'),
}));

import { resolveWebLLMModelId } from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';

describe('PromptState helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getInitialPromptSelectedModel falls back to recommended model', () => {
    vi.mocked(Settings.getAIPromptModel).mockReturnValue(null);
    vi.mocked(resolveWebLLMModelId).mockImplementation((id) => id);
    expect(getInitialPromptSelectedModel()).toBe('recommended-model');
    expect(Settings.getAIPromptModel).toHaveBeenCalledWith('recommended-model');
  });

  it('getInitialPromptUiState hydrates draft and selected model', () => {
    vi.mocked(Settings.getPromptDraft).mockReturnValue('hello draft');
    vi.mocked(Settings.getAIPromptModel).mockReturnValue('custom-model');
    vi.mocked(resolveWebLLMModelId).mockReturnValue('custom-model');

    expect(getInitialPromptUiState()).toMatchObject({
      val: 'hello draft',
      draftVal: 'hello draft',
      selectedModel: 'custom-model',
      historyIndex: -1,
      promptScope: 'project',
    });
  });
});
