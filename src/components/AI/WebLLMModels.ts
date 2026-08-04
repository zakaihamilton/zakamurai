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
      [
        'Best for',
        'Harder reasoning, visual UI planning/review, code review, architecture questions',
      ],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3.5-4B-q4f16_1-MLC',
    name: 'Qwen3.5 4B',
    ramMB: 3867.82,
    storageMB: 2390,
    requirement: 'Higher-capacity general reasoning option for capable WebGPU devices.',
    details: [
      ['System', 'Modern WebGPU-capable laptop or desktop with ~3.9 GB VRAM'],
      ['Storage', 'Medium browser cache footprint'],
      ['Speed', 'Balanced startup and generation'],
      ['Best for', 'Everyday coding help, app changes, visual UI implementation, explanations'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 3B',
    ramMB: 2504.76,
    storageMB: 1750,
    requirement: 'Recommended coding model for reliable structured edits on modern WebGPU devices.',
    details: [
      ['System', 'Most modern WebGPU-capable devices'],
      ['Storage', 'Medium-small browser cache footprint'],
      ['Speed', 'Faster than 7B coding models'],
      ['Best for', 'Quick code edits, smaller React/TypeScript tasks, constrained devices'],
    ],
    recommended: true,
  },
  {
    id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 1.5B',
    ramMB: 1629.75,
    storageMB: 920,
    requirement: 'Compact coding-focused fallback for lower-memory WebGPU devices.',
    details: [
      ['System', 'Lower-memory WebGPU-capable devices with ~1.6 GB VRAM'],
      ['Storage', 'Small browser cache footprint'],
      ['Speed', 'Fast startup and responsive generation'],
      ['Best for', 'Small code edits, autocomplete, and short coding questions'],
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
  {
    id: 'Qwen3.5-0.8B-q4f16_1-MLC',
    name: 'Qwen3.5 0.8B',
    ramMB: 1629.49,
    storageMB: 470,
    requirement: 'Lowest-memory recovery tier for constrained WebGPU devices.',
    details: [
      ['System', 'Low-resource WebGPU devices with ~1.6 GB available GPU/unified memory'],
      ['Storage', 'Small browser cache footprint'],
      ['Speed', 'Fastest startup and generation in this list'],
      ['Best for', 'Emergency fallback, simple edits, and short explanations'],
    ],
    recommended: false,
  },
];

export const LEGACY_WEB_LLM_MODEL_IDS: Record<string, string> = {
  'Qwen3-8B-q4f16_1-MLC': 'Qwen3.5-9B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC': 'Qwen3.5-4B-q4f16_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC': 'Qwen3.5-2B-q4f16_1-MLC',
};

// biome-ignore lint/style/noNonNullAssertion: the catalog compatibility test enforces one recommended entry
export const RECOMMENDED_WEB_LLM_MODEL = WEB_LLM_MODELS.find((model) => model.recommended)!;

// biome-ignore lint/style/noNonNullAssertion: the catalog compatibility test enforces this model ID
export const RECOMMENDED_COMPLETION_MODEL = WEB_LLM_MODELS.find(
  (model) => model.id === 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
)!;

/** Optional quality tier for visual planning and review on capable WebGPU devices. */
// biome-ignore lint/style/noNonNullAssertion: the catalog compatibility test enforces this model ID
export const RECOMMENDED_VISUAL_REVIEW_MODEL = WEB_LLM_MODELS.find(
  (model) => model.id === 'Qwen3.5-9B-q4f16_1-MLC',
)!;

const isMacDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const currentNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    currentNavigator.userAgentData?.platform ||
    currentNavigator.platform ||
    currentNavigator.userAgent ||
    '';
  return /mac/i.test(platform);
};

/**
 * Choose a conservative first-run default on memory-constrained machines.
 * `deviceMemory` is deliberately coarse, so an explicit user selection is
 * never changed by this helper.
 */
export const getDeviceAppropriateDefaultModelId = (): string => {
  if (typeof navigator === 'undefined') return RECOMMENDED_WEB_LLM_MODEL.id;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (Number.isFinite(deviceMemory) && (deviceMemory || 0) <= 2) {
    return 'Qwen3.5-0.8B-q4f16_1-MLC';
  }
  if (isMacDevice()) return 'Qwen3.5-2B-q4f16_1-MLC';
  if (!Number.isFinite(deviceMemory)) return RECOMMENDED_WEB_LLM_MODEL.id;
  return RECOMMENDED_WEB_LLM_MODEL.id;
};

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

export const findCachedFallbackModelId = (
  failedModelId: string,
  cachedModelIds: string[],
): string | null => {
  const failedModel = WEB_LLM_MODELS.find((model) => model.id === failedModelId);
  if (!failedModel) return null;
  const cached = new Set(cachedModelIds);
  return (
    WEB_LLM_MODELS.filter((model) => model.ramMB < failedModel.ramMB && cached.has(model.id)).sort(
      (left, right) => right.ramMB - left.ramMB,
    )[0]?.id || null
  );
};
