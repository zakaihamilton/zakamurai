import { describe, expect, it, vi } from 'vitest';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './index';

vi.mock('./WebLLMModels', () => ({
  RECOMMENDED_WEB_LLM_MODEL: 'recModel',
  WEB_LLM_MODELS: 'models',
}));

describe('AI index', () => {
  it('exports WebLLM models', () => {
    expect(RECOMMENDED_WEB_LLM_MODEL).toBe('recModel');
    expect(WEB_LLM_MODELS).toBe('models');
  });
});
