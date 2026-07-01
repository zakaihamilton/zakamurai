import { describe, expect, it, vi } from 'vitest';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS, processAIResponse } from './index';

vi.mock('./WebLLMModels', () => ({
  RECOMMENDED_WEB_LLM_MODEL: 'recModel',
  WEB_LLM_MODELS: 'models',
}));

vi.mock('./Processor', () => ({
  processAIResponse: 'processResponse',
}));

describe('AI index', () => {
  it('exports WebLLM models and processor', () => {
    expect(RECOMMENDED_WEB_LLM_MODEL).toBe('recModel');
    expect(WEB_LLM_MODELS).toBe('models');
    expect(processAIResponse).toBe('processResponse');
  });
});
