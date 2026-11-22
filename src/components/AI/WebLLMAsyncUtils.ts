import { WebLLMStallError } from './WebLLMRecovery';

export const DEFAULT_INIT_STALL_TIMEOUT_MS = 120_000;
export const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 120_000;
export const DEFAULT_CHUNK_IDLE_TIMEOUT_MS = 60_000;
export const STREAM_UPDATE_INTERVAL_MS = 200;
export const CONTEXT_SAFETY_TOKENS = 128;
export const DEFAULT_CONTEXT_WINDOW_SIZE = 4096;
export const WEB_LLM_IDLE_UNLOAD_MS = 60_000;
export const RAG_RELEASE_TIMEOUT_MS = 12_000;
export const FALLBACK_TTL_MS = 10 * 60_000;

let generationQueue: Promise<void> = Promise.resolve();

export const loadWebLLM = () => import('@mlc-ai/web-llm');

export const abortError = (message = 'WebLLM generation interrupted') =>
  new DOMException(message, 'AbortError');

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
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
}

export function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
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
}

export async function nextWithControls<T>(
  next: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WebLLMStallError('generation')), timeoutMs);
  });
  try {
    return await raceWithAbort(Promise.race([next, stalled]), signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function enqueueGeneration<T>(
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T> {
  const queued = generationQueue.then(async () => {
    throwIfAborted(signal);
    return task();
  });
  generationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return raceWithAbort(queued, signal);
}

export const waitForNetworkRetry = () => new Promise<void>((resolve) => setTimeout(resolve, 250));
