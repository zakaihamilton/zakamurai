export const WEB_LLM_MODELS = [
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 7B',
    requirement: 'Best code quality. Requires a stronger GPU and several GB of browser storage.',
    recommended: false,
  },
  {
    id: 'Qwen3-4B-q4f16_1-MLC',
    name: 'Qwen3 4B',
    requirement: 'Balanced option. Good for lighter devices while keeping solid reasoning.',
    recommended: false,
  },
  {
    id: 'Phi-4-mini-instruct-q4f16_1-MLC',
    name: 'Phi-4 Mini',
    requirement: 'Lower memory use. Faster startup with more compact responses.',
    recommended: true,
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    requirement: 'Small general model. Good fallback for devices with limited GPU memory.',
    recommended: false,
  },
];

export const RECOMMENDED_WEB_LLM_MODEL =
  WEB_LLM_MODELS.find((model) => model.recommended) || WEB_LLM_MODELS[0];
