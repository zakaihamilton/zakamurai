import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { describe, expect, it } from 'vitest';
import { WEB_LLM_MODELS } from './WebLLMModels';

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
});
