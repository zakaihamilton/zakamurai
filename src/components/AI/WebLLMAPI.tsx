/**
 * @fileoverview Browser-local LLM inference via @mlc-ai/web-llm (lazy-loaded).
 */
import type {
  WebLLMGenerationMetrics,
  WebLLMMessage,
  WebLLMOptions,
  WebLLMRecoveryEvent,
  WebLLMRecoveryReason,
} from '@/components/AI/types';
import { reportDiagnostic } from '@/components/Diagnostics/Diagnostics';
import { releaseWebLLMGpuMemory, reserveWebLLMGpuMemory } from '@/utils/ai-memory-governor';
import { DEFAULT_SYSTEM_PROMPT } from './Prompts';
import { pruneWebLLMMessages } from './WebLLMMessageUtils';
import {
  WEB_LLM_MODELS,
  findCachedFallbackModelId,
  getDeviceAppropriateDefaultModelId,
} from './WebLLMModels';
import {
  WebLLMAttemptError,
  WebLLMStallError,
  errorMessage,
  isAbortError,
  recoveryReason,
  unwrapAttemptError,
} from './WebLLMRecovery';
import { setWebLLMCachedModelIds, updateWebLLMEngine } from './WebLLMState';
export { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from './WebLLMModels';
export { pruneWebLLMMessages } from './WebLLMMessageUtils';

const DEFAULT_INIT_STALL_TIMEOUT_MS = 120_000;
const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 120_000;
const DEFAULT_CHUNK_IDLE_TIMEOUT_MS = 60_000;
const STREAM_UPDATE_INTERVAL_MS = 100;
const CONTEXT_SAFETY_TOKENS = 128;
const DEFAULT_CONTEXT_WINDOW_SIZE = 4096;
const WEB_LLM_IDLE_UNLOAD_MS = 60_000;
const RAG_RELEASE_TIMEOUT_MS = 12_000;

type CompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  extra?: {
    decode_tokens_per_s?: number;
    time_to_first_token_s?: number;
  };
};

type CompletionChoice = {
  message?: { content?: string };
  delta?: { content?: string };
  finish_reason?: string | null;
};

type CompletionResponse = {
  choices?: CompletionChoice[];
  usage?: CompletionUsage | null;
};

type WebLLMEngine = {
  interruptSignal?: boolean;
  resetChat: (keepStats?: boolean, modelId?: string) => Promise<void>;
  interruptGenerate: () => void | Promise<void>;
  unload?: () => Promise<void>;
  worker?: { terminate?: () => void };
  chat: {
    completions: {
      create: (options: Record<string, unknown>) => Promise<CompletionResponse>;
    };
  };
};

type EngineRecord = {
  modelId: string;
  contextWindowSize: number;
  promise: Promise<WebLLMEngine>;
};

type ActiveGeneration = {
  requestId: number;
  modelId: string;
  engine: WebLLMEngine;
  done: Promise<void>;
  resolveDone: () => void;
};

type PendingRequest = {
  requestedModelId: string;
  controller: AbortController;
};

type SessionFallback = {
  modelId: string;
  reason: WebLLMRecoveryReason;
};

type AttemptResult = {
  text: string;
  modelId: string;
  initializationMs?: number;
  localTimeToFirstTokenMs?: number;
  usage?: CompletionUsage | null;
  finishReason?: string | null;
};

let engineRecord: EngineRecord | null = null;
let generationQueue: Promise<void> = Promise.resolve();
let activeGeneration: ActiveGeneration | null = null;
let requestSequence = 0;
let pendingRequestSequence = 0;
const pendingRequests = new Map<number, PendingRequest>();
const sessionFallbacks = new Map<string, SessionFallback>();
let idleUnloadTimer: ReturnType<typeof setTimeout> | null = null;
let unloadWhenIdle = false;
let lifecycleListenersInstalled = false;

const loadWebLLM = () => import('@mlc-ai/web-llm');

const abortError = (message = 'WebLLM generation interrupted') =>
  new DOMException(message, 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

const errorFingerprint = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `fnv1a-${(result >>> 0).toString(16).padStart(8, '0')}`;
};

const readUsedJSHeapMB = (): number | undefined => {
  if (typeof performance === 'undefined') return undefined;
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  if (!Number.isFinite(memory?.usedJSHeapSize)) return undefined;
  return Math.round(((memory?.usedJSHeapSize || 0) / (1024 * 1024)) * 100) / 100;
};

const safeCallback = <T,>(callback: ((value: T) => void) | null | undefined, value: T) => {
  try {
    callback?.(value);
  } catch (error) {
    console.warn('[WebLLM] Consumer callback failed:', error);
  }
};

const raceWithAbort = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
};

const raceWithTimeout = <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let onAbort = () => {};
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(message));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    onAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
};

const enqueueGeneration = <T,>(
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T> => {
  const queued = generationQueue.then(async () => {
    throwIfAborted(signal);
    return task();
  });
  generationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return raceWithAbort(queued, signal);
};

const unloadEngine = async (engine: WebLLMEngine): Promise<void> => {
  try {
    if (typeof engine.unload === 'function') await engine.unload();
  } finally {
    engine.worker?.terminate?.();
  }
};

const clearIdleUnloadTimer = () => {
  if (!idleUnloadTimer) return;
  clearTimeout(idleUnloadTimer);
  idleUnloadTimer = null;
};

const prepareWebLLMGpuMemory = async (signal?: AbortSignal): Promise<void> => {
  reserveWebLLMGpuMemory();
  let forceUnloadRagModel: (() => void) | undefined;
  try {
    await raceWithTimeout(
      import('@/utils/rag/search-utility').then(({ ragSearch }) => {
        forceUnloadRagModel = () => ragSearch.forceUnloadModel();
        return ragSearch.unloadModel();
      }),
      RAG_RELEASE_TIMEOUT_MS,
      '[WebLLM] Timed out while releasing RAG inference memory',
      signal,
    );
  } catch (error) {
    if (isAbortError(error, signal)) {
      releaseWebLLMGpuMemory();
      throw abortError();
    }
    forceUnloadRagModel?.();
    console.warn('[WebLLM] Failed to release RAG inference memory:', error);
  }
};

const disposeCurrentEngine = async (expectedModelId?: string): Promise<void> => {
  const record = engineRecord;
  if (!record || (expectedModelId && record.modelId !== expectedModelId)) return;
  engineRecord = null;
  clearIdleUnloadTimer();
  try {
    const engine = await record.promise;
    await unloadEngine(engine);
  } catch (error) {
    console.warn(`Failed to dispose WebLLM engine ${record.modelId}:`, error);
  } finally {
    releaseWebLLMGpuMemory();
  }
  updateWebLLMEngine(record.modelId, {
    status: 'absent',
    progressText: '',
    generating: false,
  });
};

const disposeEngineWhenIdle = async (): Promise<void> => {
  clearIdleUnloadTimer();
  if (!engineRecord) {
    unloadWhenIdle = false;
    return;
  }
  if (activeGeneration || pendingRequests.size > 0) {
    unloadWhenIdle = true;
    return;
  }
  unloadWhenIdle = false;
  await enqueueGeneration(undefined, async () => {
    if (activeGeneration || pendingRequests.size > 0) {
      unloadWhenIdle = true;
      return;
    }
    await disposeCurrentEngine();
  });
};

const requestIdleEngineUnload = () => {
  unloadWhenIdle = true;
  void disposeEngineWhenIdle().catch((error) => {
    console.warn('[WebLLM] Failed to unload idle engine:', error);
  });
};

const scheduleIdleEngineUnload = () => {
  clearIdleUnloadTimer();
  if (!engineRecord || activeGeneration || pendingRequests.size > 0) return;
  if (unloadWhenIdle) {
    requestIdleEngineUnload();
    return;
  }
  idleUnloadTimer = setTimeout(requestIdleEngineUnload, WEB_LLM_IDLE_UNLOAD_MS);
};

const ensureLifecycleListeners = () => {
  if (lifecycleListenersInstalled || typeof document === 'undefined') return;
  lifecycleListenersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') requestIdleEngineUnload();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', requestIdleEngineUnload);
  }
};

const createEngine = async (
  selectedModel: string,
  onProgress: ((progress: string) => void) | null,
  options: WebLLMOptions,
): Promise<WebLLMEngine> => {
  await prepareWebLLMGpuMemory(options.signal);
  ensureLifecycleListeners();
  updateWebLLMEngine(selectedModel, {
    status: 'downloading',
    progressText: 'Initializing…',
    error: null,
    generating: false,
  });

  let factories: Awaited<ReturnType<typeof loadWebLLM>>;
  try {
    factories = await loadWebLLM();
  } catch (error) {
    releaseWebLLMGpuMemory();
    updateWebLLMEngine(selectedModel, {
      status: 'error',
      progressText: '',
      error: errorMessage(error),
      generating: false,
    });
    throw error;
  }
  const { CreateWebWorkerMLCEngine } = factories;
  const stallTimeoutMs = options.initStallTimeoutMs ?? DEFAULT_INIT_STALL_TIMEOUT_MS;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let rejectStall: (error: Error) => void = () => {};
  const stall = new Promise<never>((_, reject) => {
    rejectStall = reject;
  });
  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(
      () => rejectStall(new WebLLMStallError('initialization')),
      stallTimeoutMs,
    );
  };
  resetStallTimer();

  const engineConfig = {
    initProgressCallback: (progress: { text?: string }) => {
      resetStallTimer();
      const text = progress.text || '';
      updateWebLLMEngine(selectedModel, {
        status: 'downloading',
        progressText: text,
        error: null,
      });
      onProgress?.(text);
    },
  };
  const chatOptions = {
    context_window_size: options.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE,
  };
  let worker: Worker | null = null;
  let rawEnginePromise: Promise<WebLLMEngine>;

  try {
    if (typeof Worker === 'undefined') {
      throw new Error('Local AI requires Web Workers. Update or switch to a supported browser.');
    }
    worker = new Worker(new URL('./WebLLM.worker.ts', import.meta.url), { type: 'module' });
    rawEnginePromise = CreateWebWorkerMLCEngine(
      worker,
      selectedModel,
      engineConfig,
      chatOptions,
    ) as unknown as Promise<WebLLMEngine>;
  } catch (error) {
    releaseWebLLMGpuMemory();
    updateWebLLMEngine(selectedModel, {
      status: 'error',
      progressText: '',
      error: errorMessage(error),
      generating: false,
    });
    throw error;
  }

  try {
    const engine = await raceWithAbort(Promise.race([rawEnginePromise, stall]), options.signal);
    updateWebLLMEngine(selectedModel, {
      status: 'ready',
      progressText: '',
      error: null,
      generating: false,
    });
    void getCachedWebLLMModelIds();
    return engine;
  } catch (error) {
    worker?.terminate();
    void rawEnginePromise.then((engine) => unloadEngine(engine)).catch(() => undefined);
    updateWebLLMEngine(selectedModel, {
      status: 'error',
      progressText: '',
      error: errorMessage(error),
      generating: false,
    });
    releaseWebLLMGpuMemory();
    throw error;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
};

const getEngine = async (
  modelId: string,
  onProgress: ((progress: string) => void) | null,
  options: WebLLMOptions,
): Promise<{ engine: WebLLMEngine; initializationMs?: number }> => {
  throwIfAborted(options.signal);
  const contextWindowSize = options.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE;
  if (engineRecord?.modelId === modelId && engineRecord.contextWindowSize >= contextWindowSize) {
    return { engine: await engineRecord.promise };
  }

  await disposeCurrentEngine();
  const startedAt = performance.now();
  const promise = createEngine(modelId, onProgress, options);
  engineRecord = { modelId, contextWindowSize, promise };
  try {
    const engine = await promise;
    return { engine, initializationMs: performance.now() - startedAt };
  } catch (error) {
    if (engineRecord?.promise === promise) engineRecord = null;
    throw error;
  }
};

const clearEngineInterruptState = async (engine: WebLLMEngine, modelId: string): Promise<void> => {
  if ('interruptSignal' in engine) engine.interruptSignal = false;
  try {
    await engine.resetChat(false, modelId);
  } catch (error) {
    console.warn(`Failed to reset WebLLM chat state for ${modelId}:`, error);
  }
};

const interruptActiveGeneration = async (modelId?: string): Promise<void> => {
  const active = activeGeneration;
  if (!active) return;
  if (modelId && active.modelId !== modelId) return;
  try {
    await Promise.resolve(active.engine.interruptGenerate());
    await active.done;
  } catch (error) {
    console.warn(`Failed to interrupt WebLLM model ${active.modelId}:`, error);
  } finally {
    await clearEngineInterruptState(active.engine, active.modelId);
  }
};

const createGenerationOptions = (modelId: string, options: WebLLMOptions) => {
  const generationOptions: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
    top_p: options.top_p ?? 0.95,
    presence_penalty: options.presence_penalty ?? 0.1,
    frequency_penalty: options.frequency_penalty ?? 0.1,
    ...(modelId.startsWith('Qwen3') ? { extra_body: { enable_thinking: false } } : {}),
  };
  if (options.max_tokens !== undefined) generationOptions.max_tokens = options.max_tokens;
  return generationOptions;
};

const nextWithControls = async <T,>(
  next: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WebLLMStallError('generation')), timeoutMs);
  });
  try {
    return await raceWithAbort(Promise.race([next, stalled]), signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const runCompletion = async (
  engine: WebLLMEngine,
  modelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<Omit<AttemptResult, 'modelId' | 'initializationMs'>> => {
  const requestId = ++requestSequence;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  activeGeneration = { requestId, modelId, engine, done, resolveDone };
  updateWebLLMEngine(modelId, { generating: true, error: null });

  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  const abortListener = () => {
    void Promise.resolve(engine.interruptGenerate()).catch(() => undefined);
  };
  options.signal?.addEventListener('abort', abortListener, { once: true });

  try {
    const generationOptions = createGenerationOptions(modelId, options);
    if (!onUpdate) {
      const response = await nextWithControls(
        engine.chat.completions.create({
          messages,
          ...generationOptions,
        }),
        options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
        options.signal,
      );
      return {
        text: response.choices?.[0]?.message?.content ?? 'No response generated.',
        usage: response.usage,
        finishReason: response.choices?.[0]?.finish_reason,
        localTimeToFirstTokenMs: performance.now() - startedAt,
      };
    }

    const chunks = await nextWithControls(
      engine.chat.completions.create({
        messages,
        ...generationOptions,
        stream: true,
        stream_options: { include_usage: true },
      }),
      options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
      options.signal,
    );
    const iterator = (chunks as unknown as AsyncIterable<CompletionResponse>)[
      Symbol.asyncIterator
    ]();
    let fullText = '';
    let usage: CompletionUsage | null | undefined;
    let finishReason: string | null | undefined;
    let lastNotifiedText = '';
    let lastNotificationAt = 0;
    let pendingNotification: ReturnType<typeof setTimeout> | null = null;
    const notify = (force = false) => {
      if (fullText === lastNotifiedText) return;
      const elapsed = performance.now() - lastNotificationAt;
      if (force || lastNotificationAt === 0 || elapsed >= STREAM_UPDATE_INTERVAL_MS) {
        if (pendingNotification) clearTimeout(pendingNotification);
        pendingNotification = null;
        lastNotificationAt = performance.now();
        lastNotifiedText = fullText;
        safeCallback(onUpdate, fullText);
        return;
      }
      if (!pendingNotification) {
        pendingNotification = setTimeout(() => {
          pendingNotification = null;
          notify(true);
        }, STREAM_UPDATE_INTERVAL_MS - elapsed);
      }
    };

    try {
      let receivedContent = false;
      while (true) {
        const step = await nextWithControls(
          iterator.next(),
          receivedContent
            ? (options.chunkIdleTimeoutMs ?? DEFAULT_CHUNK_IDLE_TIMEOUT_MS)
            : (options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS),
          options.signal,
        );
        if (step.done) break;
        const chunk = step.value;
        usage = chunk.usage ?? usage;
        finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
        const content = chunk.choices?.[0]?.delta?.content ?? '';
        if (!content) continue;
        if (firstTokenAt === undefined) firstTokenAt = performance.now();
        receivedContent = true;
        fullText += content;
        notify();
      }
    } finally {
      if (pendingNotification) clearTimeout(pendingNotification);
      notify(true);
    }

    return {
      text: fullText,
      usage,
      finishReason,
      localTimeToFirstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
    };
  } catch (error) {
    if (isAbortError(error, options.signal)) {
      await clearEngineInterruptState(engine, modelId);
      throw abortError();
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abortListener);
    if (activeGeneration?.requestId === requestId) activeGeneration = null;
    resolveDone();
    updateWebLLMEngine(modelId, { generating: false });
  }
};

const runAttempt = async (
  modelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<AttemptResult> => {
  let engineResult: Awaited<ReturnType<typeof getEngine>>;
  try {
    engineResult = await getEngine(modelId, options.onInitProgress ?? null, options);
  } catch (error) {
    if (isAbortError(error, options.signal)) throw abortError();
    throw new WebLLMAttemptError('initialization', error);
  }
  try {
    const completion = await runCompletion(
      engineResult.engine,
      modelId,
      messages,
      onUpdate,
      options,
    );
    return { ...completion, modelId, initializationMs: engineResult.initializationMs };
  } catch (error) {
    if (isAbortError(error, options.signal)) throw abortError();
    throw new WebLLMAttemptError('generation', error);
  }
};

const getRememberedFallback = async (requestedModelId: string): Promise<SessionFallback | null> => {
  const fallback = sessionFallbacks.get(requestedModelId);
  if (!fallback) return null;
  try {
    const { hasModelInCache } = await loadWebLLM();
    if (await hasModelInCache(fallback.modelId)) return fallback;
  } catch (error) {
    console.warn('[WebLLM] Failed to verify remembered fallback:', error);
  }
  sessionFallbacks.delete(requestedModelId);
  return null;
};

const emitRecovery = (options: WebLLMOptions, event: WebLLMRecoveryEvent) => {
  safeCallback(options.onRecovery, event);
  reportDiagnostic({
    source: 'webllm',
    severity: 'warning',
    message: `${event.action} during ${event.phase}`,
    details: JSON.stringify(event),
  });
};

const executeWithRecovery = async (
  requestedModelId: string,
  messages: WebLLMMessage[],
  onUpdate: ((text: string) => void) | null,
  options: WebLLMOptions,
): Promise<{ result: AttemptResult; recoveryCount: number }> => {
  let recoveryCount = 0;
  const rememberedFallback = await getRememberedFallback(requestedModelId);
  const modelId = rememberedFallback?.modelId || requestedModelId;
  if (rememberedFallback) {
    recoveryCount++;
    emitRecovery(options, {
      requestedModelId,
      modelId,
      phase: 'initialization',
      action: 'reuse-fallback',
      reason: rememberedFallback.reason,
      attempt: recoveryCount,
    });
  }

  try {
    return { result: await runAttempt(modelId, messages, onUpdate, options), recoveryCount };
  } catch (firstError) {
    if (isAbortError(firstError, options.signal)) throw firstError;
    const firstReason = recoveryReason(firstError);
    if (!firstReason) throw firstError;
    recoveryCount++;
    // runAttempt wraps every non-abort failure with its phase.
    const firstPhase = (firstError as WebLLMAttemptError).phase;
    emitRecovery(options, {
      requestedModelId,
      modelId,
      phase: firstPhase,
      action: 'retry',
      reason: firstReason,
      attempt: recoveryCount,
    });
    updateWebLLMEngine(modelId, { status: 'recovering', error: errorMessage(firstError) });
    safeCallback(onUpdate, '');
    await disposeCurrentEngine(modelId);
  }

  try {
    return { result: await runAttempt(modelId, messages, onUpdate, options), recoveryCount };
  } catch (retryError) {
    if (isAbortError(retryError, options.signal)) throw retryError;
    const retryReason = recoveryReason(retryError);
    if (!retryReason) throw retryError;
    const cachedModelIds = await getCachedWebLLMModelIds();
    const fallbackModelId = findCachedFallbackModelId(modelId, cachedModelIds);
    if (!fallbackModelId) throw retryError;

    recoveryCount++;
    const retryPhase = (retryError as WebLLMAttemptError).phase;
    emitRecovery(options, {
      requestedModelId,
      modelId: fallbackModelId,
      phase: retryPhase,
      action: 'fallback',
      reason: retryReason,
      attempt: recoveryCount,
    });
    safeCallback(onUpdate, '');
    sessionFallbacks.set(requestedModelId, {
      modelId: fallbackModelId,
      reason: retryReason,
    });
    await disposeCurrentEngine(modelId);
    updateWebLLMEngine(modelId, {
      status: 'degraded',
      error: `Using cached fallback ${fallbackModelId}.`,
      generating: false,
    });
    return {
      result: await runAttempt(fallbackModelId, messages, onUpdate, options),
      recoveryCount,
    };
  }
};

const emitMetrics = (options: WebLLMOptions, metrics: WebLLMGenerationMetrics) => {
  safeCallback(options.onMetrics, metrics);
  reportDiagnostic({
    source: 'webllm',
    severity: metrics.outcome === 'error' ? 'error' : 'info',
    message: `Local AI ${metrics.requestKind} ${metrics.outcome}`,
    details: JSON.stringify(metrics),
  });
};

const emitFailureDiagnostic = (error: unknown, metrics: WebLLMGenerationMetrics) => {
  const unwrapped = unwrapAttemptError(error);
  const failure = unwrapped as { name?: unknown; message?: unknown };
  const message = typeof failure?.message === 'string' ? failure.message : String(unwrapped);
  reportDiagnostic({
    source: 'webllm',
    severity: 'error',
    message: 'Local AI request failed',
    details: JSON.stringify({
      phase: metrics.failurePhase || 'unknown',
      requestKind: metrics.requestKind,
      requestedModelId: metrics.requestedModelId,
      modelId: metrics.modelId,
      errorName: typeof failure?.name === 'string' ? failure.name : undefined,
      errorMessageLength: message.length,
      errorMessageFingerprint: errorFingerprint(message),
      recoveryCount: metrics.recoveryCount,
    }),
  });
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
  clearIdleUnloadTimer();
  sessionFallbacks.delete(modelId);
  try {
    await enqueueGeneration(undefined, async () => {
      await getEngine(modelId, onProgress, { requestKind: 'model-cache' });
    });
  } finally {
    scheduleIdleEngineUnload();
  }
};

export const deleteCachedWebLLMModel = async (modelId: string): Promise<void> => {
  for (const [requestedModelId, fallback] of sessionFallbacks.entries()) {
    if (requestedModelId === modelId || fallback.modelId === modelId) {
      sessionFallbacks.delete(requestedModelId);
    }
  }
  await interruptWebLLMModel(modelId);
  await enqueueGeneration(undefined, async () => {
    await disposeCurrentEngine(modelId);
    const { deleteModelAllInfoInCache } = await loadWebLLM();
    await deleteModelAllInfoInCache(modelId);
    await getCachedWebLLMModelIds();
  });
};

export const askWebLLM = async (
  prompt: string,
  systemPrompt = '',
  onUpdate: ((text: string) => void) | null = null,
  options: WebLLMOptions = {},
): Promise<string> => {
  clearIdleUnloadTimer();
  const requestedModelId = options.model || getDeviceAppropriateDefaultModelId();
  const startedAt = Date.now();
  const jsHeapUsedMBAtStart = readUsedJSHeapMB();
  const heapMetrics = () => {
    const jsHeapUsedMBAtEnd = readUsedJSHeapMB();
    return {
      ...(jsHeapUsedMBAtStart !== undefined ? { jsHeapUsedMBAtStart } : {}),
      ...(jsHeapUsedMBAtEnd !== undefined ? { jsHeapUsedMBAtEnd } : {}),
      ...(jsHeapUsedMBAtStart !== undefined && jsHeapUsedMBAtEnd !== undefined
        ? {
            jsHeapDeltaMB: Math.round((jsHeapUsedMBAtEnd - jsHeapUsedMBAtStart) * 100) / 100,
          }
        : {}),
    };
  };
  let actualModelId = requestedModelId;
  let recoveryCount = 0;
  let initializationMs: number | undefined;
  const pendingRequestId = ++pendingRequestSequence;
  const requestController = new AbortController();
  const forwardAbort = () => requestController.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  if (options.signal?.aborted) requestController.abort();
  const requestOptions: WebLLMOptions = {
    ...options,
    signal: requestController.signal,
    onRecovery: (event) => {
      actualModelId = event.modelId;
      recoveryCount = event.attempt;
      safeCallback(options.onRecovery, event);
    },
  };
  pendingRequests.set(pendingRequestId, {
    requestedModelId,
    controller: requestController,
  });
  try {
    throwIfAborted(requestOptions.signal);
    const rawMessages = requestOptions.messages || [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    const inputBudget = Math.max(
      256,
      (requestOptions.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE) -
        (requestOptions.max_tokens ?? 1200) -
        CONTEXT_SAFETY_TOKENS,
    );
    const messages = pruneWebLLMMessages(rawMessages, inputBudget) as WebLLMMessage[];
    const execution = await enqueueGeneration(requestOptions.signal, () =>
      executeWithRecovery(requestedModelId, messages, onUpdate, requestOptions),
    );
    const result = execution.result;
    actualModelId = result.modelId;
    recoveryCount = execution.recoveryCount;
    initializationMs = result.initializationMs;
    emitMetrics(requestOptions, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: 'success',
      startedAt,
      totalMs: Date.now() - startedAt,
      ...(initializationMs !== undefined ? { initializationMs } : {}),
      timeToFirstTokenMs:
        result.usage?.extra?.time_to_first_token_s !== undefined
          ? result.usage.extra.time_to_first_token_s * 1000
          : result.localTimeToFirstTokenMs,
      promptTokens: result.usage?.prompt_tokens,
      completionTokens: result.usage?.completion_tokens,
      decodeTokensPerSecond: result.usage?.extra?.decode_tokens_per_s,
      finishReason: result.finishReason,
      recoveryCount,
      ...heapMetrics(),
    });
    return result.text;
  } catch (error) {
    const aborted = isAbortError(error, requestOptions.signal);
    const unwrapped = unwrapAttemptError(error);
    const failurePhase = error instanceof WebLLMAttemptError ? error.phase : undefined;
    const failureDetails = unwrapped as { name?: unknown; message?: unknown };
    emitMetrics(requestOptions, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: aborted ? 'aborted' : 'error',
      startedAt,
      totalMs: Date.now() - startedAt,
      recoveryCount,
      ...(failurePhase ? { failurePhase } : {}),
      ...(typeof failureDetails?.name === 'string' ? { errorName: failureDetails.name } : {}),
      ...(!aborted
        ? {
            errorMessageLength: (typeof failureDetails?.message === 'string'
              ? failureDetails.message
              : String(unwrapped)
            ).length,
            errorMessageFingerprint: errorFingerprint(
              typeof failureDetails?.message === 'string'
                ? failureDetails.message
                : String(unwrapped),
            ),
          }
        : {}),
      ...heapMetrics(),
    });
    if (aborted) throw abortError();
    emitFailureDiagnostic(error, {
      requestKind: requestOptions.requestKind || 'general',
      requestedModelId,
      modelId: actualModelId,
      outcome: 'error',
      startedAt,
      totalMs: Date.now() - startedAt,
      recoveryCount,
      ...(failurePhase ? { failurePhase } : {}),
      ...(typeof failureDetails?.name === 'string' ? { errorName: failureDetails.name } : {}),
      ...heapMetrics(),
    });
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${errorMessage(unwrapAttemptError(error))}`);
  } finally {
    options.signal?.removeEventListener('abort', forwardAbort);
    pendingRequests.delete(pendingRequestId);
    scheduleIdleEngineUnload();
  }
};

export const interruptWebLLMModel = async (modelId: string | null | undefined): Promise<void> => {
  if (!modelId) return;
  for (const pending of pendingRequests.values()) {
    if (pending.requestedModelId === modelId) pending.controller.abort();
  }
  await interruptActiveGeneration(modelId);
  if (engineRecord?.modelId === modelId && !activeGeneration) {
    try {
      const engine = await engineRecord.promise;
      await clearEngineInterruptState(engine, modelId);
    } catch (error) {
      console.warn(`Failed to reset WebLLM model ${modelId}:`, error);
    }
  }
};

export const interruptWebLLM = async (): Promise<void> => {
  for (const pending of pendingRequests.values()) pending.controller.abort();
  await interruptActiveGeneration();
  if (engineRecord && !activeGeneration) {
    try {
      const engine = await engineRecord.promise;
      await clearEngineInterruptState(engine, engineRecord.modelId);
    } catch (error) {
      console.warn('Failed to reset WebLLM:', error);
    }
  }
};

export const unloadAllWebLLMEngines = async (): Promise<void> => {
  clearIdleUnloadTimer();
  unloadWhenIdle = false;
  sessionFallbacks.clear();
  await interruptWebLLM();
  await enqueueGeneration(undefined, async () => {
    await disposeCurrentEngine();
  });
};
