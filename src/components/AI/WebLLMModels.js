export const WEB_LLM_MODELS = [
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 7B',
    requirement: 'Best code quality. Requires a stronger GPU and several GB of browser storage.',
    details: [
      ['System', 'High-end device with WebGPU and generous unified/VRAM memory'],
      ['Storage', 'Largest download/cache footprint in this list'],
      ['Speed', 'Slower startup and generation, strongest code edits'],
      ['Best for', 'Complex refactors, multi-file changes, harder reasoning'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3-4B-q4f16_1-MLC',
    name: 'Qwen3 4B',
    requirement: 'Balanced option. Good for lighter devices while keeping solid reasoning.',
    details: [
      ['System', 'Modern WebGPU-capable laptop or desktop'],
      ['Storage', 'Medium browser cache footprint'],
      ['Speed', 'Balanced startup, memory use, and response quality'],
      ['Best for', 'General coding help and everyday app changes'],
    ],
    recommended: false,
  },
  {
    id: 'Phi-4-mini-instruct-q4f16_1-MLC',
    name: 'Phi-4 Mini',
    requirement: 'Lower memory use. Faster startup with more compact responses.',
    details: [
      ['System', 'Good fit for most WebGPU-capable devices'],
      ['Storage', 'Smaller browser cache footprint'],
      ['Speed', 'Fast startup and responsive generation'],
      ['Best for', 'Quick edits, explanations, and lower-risk prompts'],
    ],
    recommended: true,
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    requirement: 'Small general model. Good fallback for devices with limited GPU memory.',
    details: [
      ['System', 'Lowest memory pressure among the listed options'],
      ['Storage', 'Small browser cache footprint'],
      ['Speed', 'Fastest fallback with lighter reasoning depth'],
      ['Best for', 'Constrained devices, short prompts, simple edits'],
    ],
    recommended: false,
  },
];

export const RECOMMENDED_WEB_LLM_MODEL =
  WEB_LLM_MODELS.find((model) => model.recommended) || WEB_LLM_MODELS[0];
