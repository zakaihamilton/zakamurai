/**
 * @fileoverview Browser-local LLM inference via @mlc-ai/web-llm (lazy-loaded).
 */
import type { StateHandle, WebLLMOptions, WebLLMStateDraft } from '@/components/AI/types';
import { DEFAULT_SYSTEM_PROMPT } from './Prompts';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';
import { setWebLLMCachedModelIds, updateWebLLMEngine } from './WebLLMState';
export { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';

const DEFAULT_WEB_LLM_MODEL_ID = RECOMMENDED_WEB_LLM_MODEL.id;

type WebLLMEngine = {
  interruptSignal: boolean;
  resetChat: (keepHistory: boolean, modelId: string) => Promise<void>;
  interruptGenerate: () => Promise<void>;
  unload?: () => Promise<void>;
  chat: {
    completions: {
      create: (options: Record<string, unknown>) => Promise<{
        choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
      }>;
    };
  };
};

const enginePromises = new Map<string, Promise<WebLLMEngine>>();
const inflightGenerations = new Map<string, Promise<void>>();

const loadWebLLM = () => import('@mlc-ai/web-llm');

const isWebLLMInterruptError = (error: unknown): boolean => {
  const err = error as { message?: string };
  const message = err?.message || String(error);
  return message.includes('Message error should not be 0');
};

const clearEngineInterruptState = async (engine: WebLLMEngine, modelId: string): Promise<void> => {
  engine.interruptSignal = false;
  try {
    await engine.resetChat(false, modelId);
  } catch (error) {
    console.warn(`Failed to reset WebLLM chat state for ${modelId}:`, error);
  }
};

const interruptEngine = async (engine: WebLLMEngine, modelId: string): Promise<void> => {
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

export const getCachedWebLLMModelIds = async (): Promise<string[]> => {
  const { hasModelInCache } = await loadWebLLM();
  const cacheEntries = await Promise.all(
    WEB_LLM_MODELS.map(async (model) => {
      try {
        return [model.id, await hasModelInCache(model.id)] as const;
      } catch (error) {
        console.warn(`Failed to check WebLLM cache for ${model.id}:`, error);
        return [model.id, false] as const;
      }
    }),
  );

  const ids = cacheEntries.filter(([, isCached]) => isCached).map(([modelId]) => modelId);
  setWebLLMCachedModelIds(ids);
  return ids;
};

export const cacheWebLLMModel = async (
  modelId: string,
  onProgress: ((progress: string) => void) | null = null,
): Promise<void> => {
  await getEngine(modelId, onProgress);
};

export const deleteCachedWebLLMModel = async (modelId: string): Promise<void> => {
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

const getEngine = async (
  modelId: string = DEFAULT_WEB_LLM_MODEL_ID,
  onProgress: ((progress: string) => void) | null = null,
  options: WebLLMOptions = {},
): Promise<WebLLMEngine> => {
  const selectedModel = modelId || DEFAULT_WEB_LLM_MODEL_ID;

  if (!enginePromises.has(selectedModel)) {
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

    const enginePromise = (async () => {
      try {
        console.info(`Initializing WebLLM with ${selectedModel}...`);

        const { CreateMLCEngine } = await loadWebLLM();
        const engine = (await CreateMLCEngine(
          selectedModel,
          {
            initProgressCallback: (progress: { text?: string }) => {
              console.info(`[WebLLM]: ${progress.text}`);
              updateWebLLMEngine(selectedModel, {
                status: 'downloading',
                progressText: progress.text || '',
                error: null,
              });
              if (onProgress) {
                onProgress(progress.text || '');
              }
            },
          },
          {
            context_window_size: options.contextWindowSize ?? 4096,
          },
        )) as WebLLMEngine;

        updateWebLLMEngine(selectedModel, {
          status: 'ready',
          progressText: '',
          error: null,
          generating: false,
        });
        await getCachedWebLLMModelIds();
        return engine;
      } catch (error) {
        const err = error as Error;
        console.error('Failed to initialize WebLLM engine:', error);
        updateWebLLMEngine(selectedModel, {
          status: 'error',
          progressText: '',
          error: err?.message || String(error),
          generating: false,
        });
        enginePromises.delete(selectedModel);
        throw error;
      }
    })();
    enginePromises.set(selectedModel, enginePromise);
  }

  return enginePromises.get(selectedModel) as Promise<WebLLMEngine>;
};

export const askWebLLM = async (
  prompt: string,
  systemPrompt = '',
  onUpdate: ((text: string) => void) | null = null,
  options: WebLLMOptions = {},
): Promise<string> => {
  const modelId = options.model || DEFAULT_WEB_LLM_MODEL_ID;
  let resolveInflight: () => void = () => {};
  const inflightPromise = new Promise<void>((resolve) => {
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

    const generationOptions: Record<string, unknown> = {
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
      for await (const chunk of chunks as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>) {
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
    const err = error as { name?: string; message?: string };
    if (options.signal?.aborted || err?.name === 'AbortError' || isWebLLMInterruptError(error)) {
      throw new DOMException('WebLLM generation interrupted', 'AbortError');
    }
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${err.message || error}`);
  } finally {
    resolveInflight();
    inflightGenerations.delete(modelId);
    updateWebLLMEngine(modelId, { generating: false });
  }
};

export const interruptWebLLMModel = async (modelId: string): Promise<void> => {
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

export const interruptWebLLM = async (): Promise<void> => {
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
