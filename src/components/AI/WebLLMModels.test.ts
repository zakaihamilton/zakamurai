import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_WEB_LLM_MODEL_IDS,
  RECOMMENDED_COMPLETION_MODEL,
  RECOMMENDED_VISUAL_REVIEW_MODEL,
  RECOMMENDED_WEB_LLM_MODEL,
  WEB_LLM_MODELS,
  resolveCompletionModelId,
  resolveWebLLMModelId,
} from './WebLLMModels';

const hasModelInCache = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({ hasModelInCache }));

describe('WebLLMModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('provides numeric runtime RAM and storage requirements for every model', () => {
    for (const model of WEB_LLM_MODELS) {
      expect(model.ramMB).toBeGreaterThan(0);
      expect(model.storageMB).toBeGreaterThan(0);
    }
  });

  it('recommends Qwen3.5 4B by default', () => {
    expect(RECOMMENDED_WEB_LLM_MODEL.id).toBe('Qwen3.5-4B-q4f16_1-MLC');
  });

  it('offers Qwen3.5 9B as the opt-in visual planning and review tier', () => {
    expect(RECOMMENDED_VISUAL_REVIEW_MODEL.id).toBe('Qwen3.5-9B-q4f16_1-MLC');
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

  it('uses the preferred completion model when it is cached', async () => {
    hasModelInCache.mockResolvedValue(true);
    await expect(resolveCompletionModelId()).resolves.toBe(RECOMMENDED_COMPLETION_MODEL.id);
  });

  it('uses the selected prompt model when the preferred completion model is absent', async () => {
    hasModelInCache.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(resolveCompletionModelId('Qwen3.5-9B-q4f16_1-MLC')).resolves.toBe(
      'Qwen3.5-9B-q4f16_1-MLC',
    );
  });

  it('falls back without checking the same completion model twice', async () => {
    hasModelInCache.mockResolvedValue(false);

    await expect(resolveCompletionModelId(RECOMMENDED_COMPLETION_MODEL.id)).resolves.toBe(
      RECOMMENDED_COMPLETION_MODEL.id,
    );
    expect(hasModelInCache).toHaveBeenCalledOnce();
  });

  it('falls back when the selected prompt model is not cached', async () => {
    hasModelInCache.mockResolvedValue(false);

    await expect(resolveCompletionModelId('Qwen3.5-9B-q4f16_1-MLC')).resolves.toBe(
      RECOMMENDED_COMPLETION_MODEL.id,
    );
    expect(hasModelInCache).toHaveBeenNthCalledWith(2, 'Qwen3.5-9B-q4f16_1-MLC');
  });

  it('recovers from cache API failures and reports the diagnostic', async () => {
    const error = new Error('Cache storage unavailable');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hasModelInCache.mockRejectedValue(error);

    await expect(resolveCompletionModelId()).resolves.toBe(RECOMMENDED_COMPLETION_MODEL.id);
    expect(warn).toHaveBeenCalledWith(
      '[Completion] Failed to resolve cached completion model:',
      error,
    );
  });
});
