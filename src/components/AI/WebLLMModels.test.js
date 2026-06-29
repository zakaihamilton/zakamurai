import { describe, expect, it } from 'vitest';
import {
  LEGACY_WEB_LLM_MODEL_IDS,
  RECOMMENDED_WEB_LLM_MODEL,
  resolveWebLLMModelId,
} from './WebLLMModels';

describe('WebLLMModels', () => {
  it('recommends Qwen3.5 4B by default', () => {
    expect(RECOMMENDED_WEB_LLM_MODEL.id).toBe('Qwen3.5-4B-q4f16_1-MLC');
  });

  it('migrates legacy Qwen3 model IDs to Qwen3.5 equivalents', () => {
    for (const [legacyId, nextId] of Object.entries(LEGACY_WEB_LLM_MODEL_IDS)) {
      expect(resolveWebLLMModelId(legacyId)).toBe(nextId);
    }
  });

  it('keeps valid current model IDs unchanged', () => {
    expect(resolveWebLLMModelId('Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC')).toBe(
      'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    );
    expect(resolveWebLLMModelId('Qwen3.5-4B-q4f16_1-MLC')).toBe('Qwen3.5-4B-q4f16_1-MLC');
  });

  it('falls back to the recommended model for unknown IDs', () => {
    expect(resolveWebLLMModelId('unknown-model-id')).toBe(RECOMMENDED_WEB_LLM_MODEL.id);
  });
});
