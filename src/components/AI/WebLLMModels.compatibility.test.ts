import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { describe, expect, it } from 'vitest';
import { WEB_LLM_MODELS, getModelHardwareFitBadge } from './WebLLMModels';

describe('WebLLM model catalog compatibility', () => {
  it('uses model IDs and RAM requirements from the pinned WebLLM release', () => {
    const upstreamModels = new Map(
      prebuiltAppConfig.model_list.map((model) => [model.model_id, model]),
    );

    for (const model of WEB_LLM_MODELS) {
      const upstream = upstreamModels.get(model.id);
      expect(upstream, `${model.id} must exist in prebuiltAppConfig`).toBeDefined();
      expect(model.ramMB).toBe(upstream?.vram_required_MB);
    }
  });

  it('classifies hardware fit badges accurately across device memory tiers', () => {
    const heavy7B = WEB_LLM_MODELS.find((m) => m.id.includes('7B')) ?? WEB_LLM_MODELS[0];
    const tiny05B = WEB_LLM_MODELS.find((m) => m.id.includes('0.5B')) ?? WEB_LLM_MODELS[0];
    const mid3B = WEB_LLM_MODELS.find((m) => m.id.includes('3B')) ?? WEB_LLM_MODELS[0];

    expect(getModelHardwareFitBadge(heavy7B, 4)).toBe('Heavy for GPU');
    expect(getModelHardwareFitBadge(tiny05B, 8)).toBe('Fastest');
    expect(getModelHardwareFitBadge(mid3B, 8)).toBe('Fits Device');
  });
});
