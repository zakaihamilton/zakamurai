import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_WEB_LLM_MODEL_IDS,
  RECOMMENDED_COMPLETION_MODEL,
  RECOMMENDED_VISUAL_REVIEW_MODEL,
  RECOMMENDED_WEB_LLM_MODEL,
  WEB_LLM_MODELS,
  findCachedFallbackModelId,
  getDeviceAppropriateDefaultModelId,
  resolveCompletionModelId,
  resolveWebLLMModelId,
} from './WebLLMModels';

const hasModelInCache = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({ hasModelInCache }));

describe('WebLLMModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasModelInCache.mockReset();
  });
  it('provides numeric runtime RAM and storage requirements for every model', () => {
    for (const model of WEB_LLM_MODELS) {
      expect(model.ramMB).toBeGreaterThan(0);
      expect(model.storageMB).toBeGreaterThan(0);
    }
  });

  it('recommends Qwen2.5 Coder 3B for reliable agent edits', () => {
    expect(RECOMMENDED_WEB_LLM_MODEL.id).toBe('Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC');
  });

  it('uses the reliable coding model as the default on ordinary devices', () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { deviceMemory: 8 },
    });
    expect(getDeviceAppropriateDefaultModelId()).toBe('Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('uses the lighter Qwen3.5 2B model on Mac devices', () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { platform: 'MacIntel', userAgent: 'Macintosh' },
    });
    expect(getDeviceAppropriateDefaultModelId()).toBe('Qwen3.5-2B-q4f16_1-MLC');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('uses the smallest recovery tier only on very low-memory devices', () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { deviceMemory: 2 },
    });
    expect(getDeviceAppropriateDefaultModelId()).toBe('Qwen3.5-0.8B-q4f16_1-MLC');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('offers Qwen3.5 9B as the opt-in visual planning and review tier', () => {
    expect(RECOMMENDED_VISUAL_REVIEW_MODEL.id).toBe('Qwen3.5-9B-q4f16_1-MLC');
  });

  it('offers Qwen3.5 0.8B as the low-resource recovery tier', () => {
    expect(WEB_LLM_MODELS).toContainEqual(
      expect.objectContaining({
        id: 'Qwen3.5-0.8B-q4f16_1-MLC',
        ramMB: 1629.49,
      }),
    );
  });

  it('keeps Qwen2.5 Coder 1.5B available as a selectable compact coding model', () => {
    expect(resolveWebLLMModelId('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC')).toBe(
      'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    );
    expect(WEB_LLM_MODELS).toContainEqual(
      expect.objectContaining({
        id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
        ramMB: 1629.75,
      }),
    );
  });

  it('selects the closest smaller cached fallback by RAM', () => {
    expect(
      findCachedFallbackModelId('Qwen3.5-9B-q4f16_1-MLC', [
        'Qwen3.5-0.8B-q4f16_1-MLC',
        'Qwen3.5-4B-q4f16_1-MLC',
        'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
      ]),
    ).toBe('Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC');
    expect(findCachedFallbackModelId('Qwen3.5-2B-q4f16_1-MLC', ['Qwen3.5-0.8B-q4f16_1-MLC'])).toBe(
      'Qwen3.5-0.8B-q4f16_1-MLC',
    );
  });

  it('does not select an uncached, equal-size, or larger fallback', () => {
    expect(
      findCachedFallbackModelId('Qwen3.5-4B-q4f16_1-MLC', ['Qwen3.5-9B-q4f16_1-MLC']),
    ).toBeNull();
    expect(findCachedFallbackModelId('unknown-model', ['Qwen3.5-0.8B-q4f16_1-MLC'])).toBeNull();
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

  it('treats an empty preferred model as the recommended prompt model', async () => {
    hasModelInCache.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(resolveCompletionModelId('')).resolves.toBe(RECOMMENDED_WEB_LLM_MODEL.id);
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
