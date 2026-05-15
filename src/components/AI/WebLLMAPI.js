import { CreateMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';
import { DEFAULT_SYSTEM_PROMPT } from './Prompts';

export const WEB_LLM_MODELS = [
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 Coder 7B',
    requirement: 'Best code quality. Requires a stronger GPU and several GB of browser storage.',
    recommended: true,
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
    recommended: false,
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

const DEFAULT_WEB_LLM_MODEL_ID = RECOMMENDED_WEB_LLM_MODEL.id;

// A map of initialization promises keyed by model ID.
const enginePromises = new Map();

export const getCachedWebLLMModelIds = async () => {
  const cacheEntries = await Promise.all(
    WEB_LLM_MODELS.map(async (model) => {
      try {
        return [model.id, await hasModelInCache(model.id)];
      } catch (error) {
        console.warn(`Failed to check WebLLM cache for ${model.id}:`, error);
        return [model.id, false];
      }
    }),
  );

  return cacheEntries.filter(([_, isCached]) => isCached).map(([modelId]) => modelId);
};

/**
 * Initializes the WebLLM engine exactly once.
 * Subsequent calls will return the already-running engine promise.
 * @param {string} modelId - WebLLM model id to initialize.
 * @param {function} onProgress - Optional callback for initialization progress.
 */
const getEngine = (modelId = DEFAULT_WEB_LLM_MODEL_ID, onProgress = null) => {
  const selectedModel = modelId || DEFAULT_WEB_LLM_MODEL_ID;

  if (!enginePromises.has(selectedModel)) {
    // Assign an async IIFE to the promise variable to satisfy Biome's
    // no-async-promise-executor rule while maintaining the singleton pattern.
    const enginePromise = (async () => {
      try {
        console.info(`Initializing WebLLM with ${selectedModel}...`);

        const engine = await CreateMLCEngine(
          selectedModel,
          {
            initProgressCallback: (progress) => {
              console.info(`[WebLLM]: ${progress.text}`);
              if (onProgress) {
                onProgress(progress.text);
              }
            },
          },
          {
            context_window_size: 8192,
          },
        );

        return engine;
      } catch (error) {
        console.error('Failed to initialize WebLLM engine:', error);
        // Reset on failure so the user can try again without reloading
        enginePromises.delete(selectedModel);
        throw error;
      }
    })();
    enginePromises.set(selectedModel, enginePromise);
  }

  return enginePromises.get(selectedModel);
};

/**
 * Sends a prompt to the local WebLLM model and returns the text response.
 * @param {string} prompt - The user's input or full codebase context.
 * @param {string} systemPrompt - Optional system prompt.
 * @param {function} onUpdate - Optional callback for streaming updates (e.g., partial text).
 * @param {object} options - Optional generation overrides.
 * @returns {Promise<string>} - The AI's generated response.
 */
export const askWebLLM = async (prompt, systemPrompt = '', onUpdate = null, options = {}) => {
  try {
    console.info('[WebLLM] Retrieving engine...');
    const engine = await getEngine(options.model, onUpdate);
    console.info('[WebLLM] Engine retrieved. Starting completion...');

    const defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT;

    const messages = [
      {
        role: 'system',
        content: systemPrompt || defaultSystemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const generationOptions = {
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.95,
      presence_penalty: options.presence_penalty ?? 0.1,
      frequency_penalty: options.frequency_penalty ?? 0.1,
    };

    if (options.max_tokens !== undefined) {
      generationOptions.max_tokens = options.max_tokens;
    }

    if (onUpdate) {
      const chunks = await engine.chat.completions.create({
        messages,
        ...generationOptions,
        stream: true,
      });

      let fullText = '';
      for await (const chunk of chunks) {
        const content = chunk.choices?.[0]?.delta?.content ?? '';
        fullText += content;
        onUpdate(fullText);
      }
      return fullText;
    }

    const reply = await engine.chat.completions.create({
      messages,
      ...generationOptions,
    });

    return reply.choices?.[0]?.message?.content ?? 'No response generated.';
  } catch (error) {
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${error.message || error}`);
  }
};

/**
 * Halts the current generation process of the WebLLM engine.
 */
export const interruptWebLLM = async () => {
  for (const enginePromise of enginePromises.values()) {
    try {
      const engine = await enginePromise;
      await engine.interruptGenerate();
    } catch (e) {
      console.warn('Failed to interrupt WebLLM:', e);
    }
  }
};
