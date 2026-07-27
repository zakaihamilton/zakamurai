/**
 * @fileoverview Browser-local LLM inference via @mlc-ai/web-llm (lazy-loaded).
 */
import { DEFAULT_SYSTEM_PROMPT } from './Prompts';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';
import { setWebLLMCachedModelIds, updateWebLLMEngine } from './WebLLMState';
export { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';

const DEFAULT_WEB_LLM_MODEL_ID = RECOMMENDED_WEB_LLM_MODEL.id;

// A map of initialization promises keyed by model ID.
const enginePromises = new Map();
/** @type {Map<string, Promise<void>>} */
const inflightGenerations = new Map();

/** Lazy-load the heavy WebLLM package — not on first IDE paint. */
const loadWebLLM = () => import('@mlc-ai/web-llm');

const isWebLLMInterruptError = (error) => {
  const message = error?.message || String(error);
  return message.includes('Message error should not be 0');
};

const clearEngineInterruptState = async (engine, modelId) => {
  // web-llm leaves interruptSignal true after interruptGenerate(); the next non-streaming
  // request then calls triggerStop() before prefill and throws.
  engine.interruptSignal = false;
  try {
    await engine.resetChat(false, modelId);
  } catch (error) {
    console.warn(`Failed to reset WebLLM chat state for ${modelId}:`, error);
  }
};

const interruptEngine = async (engine, modelId) => {
  const inflight = inflightGenerations.get(modelId);
  if (!inflight) {
    await clearEngineInterruptState(engine, modelId);
    return;
  }

  try {
    await engine.interruptGenerate();
    await inflight;
  } catch (error) {
    console.warn(`Failed to interrupt WebLLM model ${modelId}:`, error);
  } finally {
    await clearEngineInterruptState(engine, modelId);
  }
};

/**
 * Returns model ids that are already present in the WebLLM browser cache.
 *
 * @returns {Promise<string[]>}
 */
export const getCachedWebLLMModelIds = async () => {
  const { hasModelInCache } = await loadWebLLM();
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

  const ids = cacheEntries.filter(([_, isCached]) => isCached).map(([modelId]) => modelId);
  setWebLLMCachedModelIds(ids);
  return ids;
};

/**
 * Downloads and initializes a model so it is ready for inference.
 *
 * @param {string} modelId
 * @param {((progress: string) => void) | null} [onProgress]
 * @returns {Promise<void>}
 */
export const cacheWebLLMModel = async (modelId, onProgress = null) => {
  await getEngine(modelId, onProgress);
};

/**
 * Interrupts any in-flight generation and removes `modelId` from cache and engine singletons.
 *
 * @param {string} modelId
 * @returns {Promise<void>}
 */
export const deleteCachedWebLLMModel = async (modelId) => {
  await interruptWebLLM();
  const enginePromise = enginePromises.get(modelId);
  if (enginePromise) {
    try {
      const engine = await enginePromise;
      if (engine && typeof engine.unload === 'function') {
        await engine.unload();
      }
    } catch (error) {
      console.warn(`Failed to unload engine ${modelId}:`, error);
    }
  }
  enginePromises.delete(modelId);
  updateWebLLMEngine(modelId, {
    status: 'absent',
    progressText: '',
    error: null,
    generating: false,
  });
  const { deleteModelAllInfoInCache } = await loadWebLLM();
  await deleteModelAllInfoInCache(modelId);
  await getCachedWebLLMModelIds();
};

/**
 * Initializes the WebLLM engine exactly once.
 * Subsequent calls will return the already-running engine promise.
 * @param {string} modelId - WebLLM model id to initialize.
 * @param {function} onProgress - Optional callback for initialization progress.
 */
const getEngine = async (modelId = DEFAULT_WEB_LLM_MODEL_ID, onProgress = null, options = {}) => {
  const selectedModel = modelId || DEFAULT_WEB_LLM_MODEL_ID;

  if (!enginePromises.has(selectedModel)) {
    // Unload existing models to free GPU memory before initializing a new one
    for (const [existingId, promise] of enginePromises.entries()) {
      try {
        const existingEngine = await promise;
        if (existingEngine && typeof existingEngine.unload === 'function') {
          console.info(`Unloading previous WebLLM engine ${existingId} for GPU memory safety...`);
          await existingEngine.unload();
        }
      } catch (e) {
        console.warn(`Error unloading existing WebLLM engine ${existingId}:`, e);
      }
      enginePromises.delete(existingId);
    }

    updateWebLLMEngine(selectedModel, {
      status: 'downloading',
      progressText: 'Initializing…',
      error: null,
      generating: false,
    });

    // Assign an async IIFE to the promise variable to satisfy Biome's
    // no-async-promise-executor rule while maintaining the singleton pattern.
    const enginePromise = (async () => {
      try {
        console.info(`Initializing WebLLM with ${selectedModel}...`);

        const { CreateMLCEngine } = await loadWebLLM();
        const engine = await CreateMLCEngine(
          selectedModel,
          {
            initProgressCallback: (progress) => {
              console.info(`[WebLLM]: ${progress.text}`);
              updateWebLLMEngine(selectedModel, {
                status: 'downloading',
                progressText: progress.text || '',
                error: null,
              });
              if (onProgress) {
                onProgress(progress.text);
              }
            },
          },
          {
            context_window_size: options.contextWindowSize ?? 4096,
          },
        );

        updateWebLLMEngine(selectedModel, {
          status: 'ready',
          progressText: '',
          error: null,
          generating: false,
        });
        await getCachedWebLLMModelIds();
        return engine;
      } catch (error) {
        console.error('Failed to initialize WebLLM engine:', error);
        updateWebLLMEngine(selectedModel, {
          status: 'error',
          progressText: '',
          error: error?.message || String(error),
          generating: false,
        });
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
 * @param {string} [systemPrompt] - Optional system prompt.
 * @param {((text: string) => void) | null} [onUpdate] - Optional callback for streaming updates.
 * @param {object} [options] - Generation overrides (`model`, `temperature`, `signal`, etc.).
 * @returns {Promise<string>} The AI's generated response.
 */
export const askWebLLM = async (prompt, systemPrompt = '', onUpdate = null, options = {}) => {
  const modelId = options.model || DEFAULT_WEB_LLM_MODEL_ID;
  let resolveInflight = () => {};
  const inflightPromise = new Promise((resolve) => {
    resolveInflight = resolve;
  });
  inflightGenerations.set(modelId, inflightPromise);

  try {
    if (options.signal?.aborted) {
      throw new DOMException('WebLLM generation interrupted', 'AbortError');
    }

    updateWebLLMEngine(modelId, { generating: true, error: null });
    console.info('[WebLLM] Retrieving engine...');
    const engine = await getEngine(options.model, options.onInitProgress ?? null, options);
    console.info('[WebLLM] Engine retrieved. Starting completion...');

    const defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT;

    const messages = options.messages || [
      { role: 'system', content: systemPrompt || defaultSystemPrompt },
      { role: 'user', content: prompt },
    ];

    const generationOptions = {
      temperature: options.temperature ?? 0.7,
      top_p: options.top_p ?? 0.95,
      presence_penalty: options.presence_penalty ?? 0.1,
      frequency_penalty: options.frequency_penalty ?? 0.1,
      ...(modelId.startsWith('Qwen3') ? { extra_body: { enable_thinking: false } } : {}),
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
    if (options.signal?.aborted || error?.name === 'AbortError' || isWebLLMInterruptError(error)) {
      throw new DOMException('WebLLM generation interrupted', 'AbortError');
    }
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${error.message || error}`);
  } finally {
    resolveInflight();
    inflightGenerations.delete(modelId);
    updateWebLLMEngine(modelId, { generating: false });
  }
};

/**
 * Halts generation for a single loaded WebLLM model.
 *
 * @param {string} modelId
 * @returns {Promise<void>}
 */
export const interruptWebLLMModel = async (modelId) => {
  if (!modelId) return;

  const enginePromise = enginePromises.get(modelId);
  if (!enginePromise) return;

  try {
    const engine = await enginePromise;
    await interruptEngine(engine, modelId);
    updateWebLLMEngine(modelId, { generating: false, status: 'interrupted' });
  } catch (e) {
    console.warn(`Failed to interrupt WebLLM model ${modelId}:`, e);
  }
};

/**
 * Halts in-flight generation on every initialized WebLLM engine.
 *
 * @returns {Promise<void>}
 */
export const interruptWebLLM = async () => {
  for (const [modelId, enginePromise] of enginePromises.entries()) {
    try {
      const engine = await enginePromise;
      await interruptEngine(engine, modelId);
      updateWebLLMEngine(modelId, { generating: false, status: 'interrupted' });
    } catch (e) {
      console.warn('Failed to interrupt WebLLM:', e);
    }
  }
};
