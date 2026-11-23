import type { WebLLMOptions } from '@/components/AI/types';
import { releaseWebLLMGpuMemory, reserveWebLLMGpuMemory } from '@/utils/ai-memory-governor';
import {
  DEFAULT_CONTEXT_WINDOW_SIZE,
  DEFAULT_INIT_STALL_TIMEOUT_MS,
  RAG_RELEASE_TIMEOUT_MS,
  WEB_LLM_IDLE_UNLOAD_MS,
  abortError,
  enqueueGeneration,
  loadWebLLM,
  raceWithAbort,
  raceWithTimeout,
  throwIfAborted,
} from './WebLLMAsyncUtils';
import type {
  ActiveGeneration,
  EngineRecord,
  PendingRequest,
  WebLLMEngine,
} from './WebLLMEngineTypes';
import { WebLLMStallError, errorMessage, isAbortError } from './WebLLMRecovery';
import { clearSessionHistories } from './WebLLMSession';
import { updateWebLLMEngine } from './WebLLMState';

let engineRecord: EngineRecord | null = null;
let activeGeneration: ActiveGeneration | null = null;
let requestSequence = 0;
let pendingRequestSequence = 0;
const pendingRequests = new Map<number, PendingRequest>();
let idleUnloadTimer: ReturnType<typeof setTimeout> | null = null;
let unloadWhenIdle = false;
let lifecycleListenersInstalled = false;

const unloadEngine = async (engine: WebLLMEngine): Promise<void> => {
  try {
    if (typeof engine.unload === 'function') await engine.unload();
  } finally {
    engine.worker?.terminate?.();
  }
};

export const clearIdleUnloadTimer = () => {
  if (!idleUnloadTimer) return;
  clearTimeout(idleUnloadTimer);
  idleUnloadTimer = null;
};

export const resetIdleUnloadState = () => {
  clearIdleUnloadTimer();
  unloadWhenIdle = false;
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

export const disposeCurrentEngine = async (expectedModelId?: string): Promise<void> => {
  const record = engineRecord;
  if (!record || (expectedModelId && record.modelId !== expectedModelId)) return;
  engineRecord = null;
  clearSessionHistories();
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

export const scheduleIdleEngineUnload = () => {
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
  onModelReady?: () => void,
): Promise<WebLLMEngine> => {
  await prepareWebLLMGpuMemory(options.signal);
  ensureLifecycleListeners();
  updateWebLLMEngine(selectedModel, {
    status: 'downloading',
    progress: 0,
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
      progress: 0,
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
    initProgressCallback: (progress: { progress?: number; text?: string }) => {
      resetStallTimer();
      const text = progress.text || '';
      updateWebLLMEngine(selectedModel, {
        status: 'downloading',
        progress:
          typeof progress.progress === 'number' && Number.isFinite(progress.progress)
            ? Math.min(Math.max(progress.progress, 0), 1)
            : undefined,
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
      progress: 0,
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
      progress: 1,
      progressText: '',
      error: null,
      generating: false,
    });
    onModelReady?.();
    return engine;
  } catch (error) {
    worker?.terminate();
    void rawEnginePromise.then((engine) => unloadEngine(engine)).catch(() => undefined);
    updateWebLLMEngine(selectedModel, {
      status: 'error',
      progress: 0,
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

export const getEngine = async (
  modelId: string,
  onProgress: ((progress: string) => void) | null,
  options: WebLLMOptions,
  onModelReady?: () => void,
): Promise<{ engine: WebLLMEngine; initializationMs?: number }> => {
  throwIfAborted(options.signal);
  const contextWindowSize = options.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE;
  if (engineRecord?.modelId === modelId && engineRecord.contextWindowSize >= contextWindowSize) {
    return { engine: await engineRecord.promise };
  }

  await disposeCurrentEngine();
  const startedAt = performance.now();
  const promise = createEngine(modelId, onProgress, options, onModelReady);
  engineRecord = { modelId, contextWindowSize, promise };
  try {
    const engine = await promise;
    return { engine, initializationMs: performance.now() - startedAt };
  } catch (error) {
    if (engineRecord?.promise === promise) engineRecord = null;
    throw error;
  }
};

export const clearEngineInterruptState = async (
  engine: WebLLMEngine,
  modelId: string,
): Promise<void> => {
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

export const beginActiveGeneration = (
  engine: WebLLMEngine,
  modelId: string,
): { requestId: number; resolveDone: () => void } => {
  const requestId = ++requestSequence;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  activeGeneration = { requestId, modelId, engine, done, resolveDone };
  return { requestId, resolveDone };
};

export const finishActiveGeneration = (
  requestId: number,
  resolveDone: () => void,
  modelId: string,
): void => {
  if (activeGeneration?.requestId === requestId) activeGeneration = null;
  resolveDone();
  updateWebLLMEngine(modelId, { generating: false });
};

export const isCurrentActiveGeneration = (requestId: number): boolean =>
  activeGeneration?.requestId === requestId;

export const registerPendingRequest = (
  requestedModelId: string,
  controller: AbortController,
): number => {
  const id = ++pendingRequestSequence;
  pendingRequests.set(id, { requestedModelId, controller });
  return id;
};

export const unregisterPendingRequest = (id: number): void => {
  pendingRequests.delete(id);
};

export const interruptModelRequestsAndEngine = async (
  modelId: string | null | undefined,
): Promise<void> => {
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

export const interruptAllRequestsAndEngine = async (): Promise<void> => {
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
