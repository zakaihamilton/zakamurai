export const WEB_LLM_MODELS = [
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 7B',
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
    id: 'Qwen3-8B-q4f16_1-MLC',
    name: 'Qwen3 8B',
    requirement: 'Strongest general reasoning option. Heavier than Qwen3 4B.',
    details: [
      ['System', 'High-end WebGPU device'],
      ['Storage', 'Large browser cache footprint'],
      ['Speed', 'Slower than 4B models'],
      ['Best for', 'Harder reasoning, planning, code review, architecture questions'],
    ],
    recommended: false,
  },
  {
    id: 'Qwen3-4B-q4f16_1-MLC',
    name: 'Qwen3 4B',
    requirement: 'Best default balance of quality, reasoning, and browser practicality.',
    details: [
      ['System', 'Modern WebGPU-capable laptop or desktop'],
      ['Storage', 'Medium browser cache footprint'],
      ['Speed', 'Balanced startup and generation'],
      ['Best for', 'Everyday coding help, app changes, explanations'],
    ],
    recommended: true,
  },
  {
    id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 3B',
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
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    name: 'Qwen3 1.7B',
    requirement: 'Lightweight reasoning fallback. Better modern fallback than Llama 3.2 3B for many tasks.',
    details: [
      ['System', 'Lower-memory WebGPU-capable devices'],
      ['Storage', 'Small browser cache footprint'],
      ['Speed', 'Fast startup and responsive generation'],
      ['Best for', 'Simple edits, explanations, short prompts'],
    ],
    recommended: false,
  },
];

export const RECOMMENDED_WEB_LLM_MODEL =
  WEB_LLM_MODELS.find((model) => model.recommended) || WEB_LLM_MODELS[0];
