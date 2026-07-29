import type { WebLLMModel } from '@/components/AI/types';

export const WEB_LLM_MODELS: WebLLMModel[] = [
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 7B',
    ramMB: 5106.67,
    storageMB: 4300,
    requirement: 'Best coding model in this list. Requires a strong GPU and large browser cache.',
    details: [
      ['System', 'High-end WebGPU laptop/desktop with generous unified/VRAM memory'],
      ['Storage', 'Large download/cache footprint'],
      ['Speed', 'Slower startup and generation'],
      ['Best for', 'Complex code edits, refactors, TypeScript/React changes'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3.5-9B-q4f16_1-MLC',
    name: 'Qwen3.5 9B',
    ramMB: 6433.01,
    storageMB: 5060,
    requirement: 'Strongest general reasoning option. Heavier than Qwen3.5 4B.',
    details: [
      ['System', 'High-end WebGPU device with ~6.4 GB VRAM'],
      ['Storage', 'Large browser cache footprint'],
      ['Speed', 'Slower than 4B models'],
      ['Best for', 'Harder reasoning, planning, code review, architecture questions'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3.5-4B-q4f16_1-MLC',
    name: 'Qwen3.5 4B',
    ramMB: 3867.82,
    storageMB: 2390,
    requirement: 'Best default balance of quality, reasoning, and browser practicality.',
    details: [
      ['System', 'Modern WebGPU-capable laptop or desktop with ~3.9 GB VRAM'],
      ['Storage', 'Medium browser cache footprint'],
      ['Speed', 'Balanced startup and generation'],
      ['Best for', 'Everyday coding help, app changes, explanations'],
    ],
    recommended: true,
  },
  {
    id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 3B',
    ramMB: 2504.76,
    storageMB: 1750,
    requirement: 'Smaller coding-focused fallback. Better coding fit than many generic 3B models.',
    details: [
      ['System', 'Most modern WebGPU-capable devices'],
      ['Storage', 'Medium-small browser cache footprint'],
      ['Speed', 'Faster than 7B coding models'],
      ['Best for', 'Quick code edits, smaller React/TypeScript tasks, constrained devices'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3.5-2B-q4f16_1-MLC',
    name: 'Qwen3.5 2B',
    ramMB: 2245.44,
    storageMB: 1080,
    requirement: 'Lightweight reasoning fallback for lower-memory devices.',
    details: [
      ['System', 'Lower-memory WebGPU-capable devices with ~2.2 GB VRAM'],
      ['Storage', 'Small browser cache footprint'],
      ['Speed', 'Fast startup and responsive generation'],
      ['Best for', 'Simple edits, explanations, short prompts'],
    ],
    recommended: false,
  },
];

export const LEGACY_WEB_LLM_MODEL_IDS: Record<string, string> = {
  'Qwen3-8B-q4f16_1-MLC': 'Qwen3.5-9B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC': 'Qwen3.5-4B-q4f16_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC': 'Qwen3.5-2B-q4f16_1-MLC',
};

export const RECOMMENDED_WEB_LLM_MODEL =
  WEB_LLM_MODELS.find((model) => model.recommended) || WEB_LLM_MODELS[0];

export const RECOMMENDED_COMPLETION_MODEL =
  WEB_LLM_MODELS.find((model) => model.id === 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC') ||
  WEB_LLM_MODELS.find((model) => model.id.includes('Coder-3B')) ||
  RECOMMENDED_WEB_LLM_MODEL;

const VALID_WEB_LLM_MODEL_IDS = new Set(WEB_LLM_MODELS.map((model) => model.id));

export const resolveWebLLMModelId = (savedId: string): string => {
  const migratedId = LEGACY_WEB_LLM_MODEL_IDS[savedId] || savedId;
  if (VALID_WEB_LLM_MODEL_IDS.has(migratedId)) {
    return migratedId;
  }
  return RECOMMENDED_WEB_LLM_MODEL.id;
};

export const resolveCompletionModelId = async (preferredModelId?: string): Promise<string> => {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    if (await hasModelInCache(RECOMMENDED_COMPLETION_MODEL.id)) {
      return RECOMMENDED_COMPLETION_MODEL.id;
    }

    const promptModel = resolveWebLLMModelId(preferredModelId || RECOMMENDED_WEB_LLM_MODEL.id);
    if (promptModel !== RECOMMENDED_COMPLETION_MODEL.id && (await hasModelInCache(promptModel))) {
      return promptModel;
    }
  } catch (error) {
    console.warn('[Completion] Failed to resolve cached completion model:', error);
  }

  return RECOMMENDED_COMPLETION_MODEL.id;
};
