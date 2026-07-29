/**
 * Highlight worker client — offloads tokenization from the main thread.
 * Falls back to synchronous highlightCode when Workers are unavailable.
 */

import type { CursorPosition } from '@/components/state/domain-types';
import highlighterStyles from './Highlighter.module.css';
import { highlightCode } from './highlighter';
import type {
  CancellableHighlightPromise,
  HighlightEditorState,
  HighlightStyles,
  HighlightWorkerMessage,
  HighlightWorkerResponse,
} from './types';

/** Prefer worker for buffers above this size (chars). */
export const HIGHLIGHT_WORKER_THRESHOLD = 4000;

let worker: Worker | null = null;
let workerFailed = false;
let requestSeq = 0;

interface PendingEntry {
  resolve: (value: string | null) => void;
  fallback: () => string;
  cancelled: boolean;
}

const pending = new Map<number, PendingEntry>();

const stylePayload = (): HighlightStyles => ({ ...highlighterStyles });

function runSync(
  code: string,
  filePath: string,
  state: HighlightEditorState,
  styles: HighlightStyles | undefined,
  showFind: boolean | undefined,
  findQuery: string | undefined,
  matchIndex: number | undefined,
  suggestion: string | undefined,
  cursorPos: CursorPosition | undefined,
  navigationLinksEnabled: boolean | undefined,
  isOriginal: boolean,
): string {
  return highlightCode(
    code,
    filePath,
    state,
    styles,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  );
}

function settlePendingWithFallback(): void {
  for (const [, entry] of pending) {
    try {
      entry.resolve(entry.fallback());
    } catch {
      entry.resolve('');
    }
  }
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./highlight.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<HighlightWorkerResponse>) => {
      const { id, html, error } = event.data || {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (entry.cancelled) {
        entry.resolve(null);
        return;
      }
      if (error) {
        try {
          entry.resolve(entry.fallback());
        } catch {
          entry.resolve('');
        }
        return;
      }
      entry.resolve(html ?? '');
    };
    worker.onerror = () => {
      workerFailed = true;
      settlePendingWithFallback();
      try {
        worker?.terminate();
      } catch {
        // ignore
      }
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function highlightCodeSync(
  code: string,
  filePath: string,
  state: HighlightEditorState,
  styles?: HighlightStyles,
  showFind?: boolean,
  findQuery?: string,
  matchIndex?: number,
  suggestion?: string,
  cursorPos?: CursorPosition,
  navigationLinksEnabled?: boolean,
  isOriginal = false,
): string {
  return runSync(
    code,
    filePath,
    state,
    styles,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  );
}

export function highlightCodeAsync(
  code: string,
  filePath: string,
  state: HighlightEditorState,
  styles: HighlightStyles | undefined,
  showFind: boolean | undefined,
  findQuery: string | undefined,
  matchIndex: number | undefined,
  suggestion: string | undefined,
  cursorPos: CursorPosition | undefined,
  navigationLinksEnabled: boolean | undefined,
  isOriginal = false,
): CancellableHighlightPromise {
  if (!code) {
    const empty = Promise.resolve('') as CancellableHighlightPromise;
    empty.cancel = () => {};
    return empty;
  }

  const fallback = () =>
    runSync(
      code,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      navigationLinksEnabled,
      isOriginal,
    );

  if (code.length <= HIGHLIGHT_WORKER_THRESHOLD) {
    const syncResult = Promise.resolve(fallback()) as CancellableHighlightPromise;
    syncResult.cancel = () => {};
    return syncResult;
  }

  const w = getWorker();
  if (!w) {
    const syncResult = Promise.resolve(fallback()) as CancellableHighlightPromise;
    syncResult.cancel = () => {};
    return syncResult;
  }

  const fileContentsForWorker =
    navigationLinksEnabled && state?.fileContents
      ? Object.fromEntries(Object.keys(state.fileContents).map((k) => [k, '']))
      : {};
  const id = ++requestSeq;
  const payload: HighlightWorkerMessage = {
    id,
    code,
    filePath,
    state: {
      pendingDiffs: state?.pendingDiffs || {},
      selectedLines: state?.selectedLines || {},
      fileContents: fileContentsForWorker,
    },
    styles: styles ?? stylePayload(),
    showFind: showFind ?? false,
    findQuery: findQuery ?? '',
    matchIndex: matchIndex ?? -1,
    suggestion,
    cursorPos,
    navigationLinksEnabled: navigationLinksEnabled ?? false,
    isOriginal,
  };

  let cancelled = false;
  const promise = new Promise<string | null>((resolve) => {
    pending.set(id, {
      resolve,
      fallback,
      get cancelled() {
        return cancelled;
      },
    } as PendingEntry);
    try {
      w.postMessage(payload);
    } catch (_e) {
      pending.delete(id);
      resolve(cancelled ? null : fallback());
    }
  }) as CancellableHighlightPromise;

  promise.cancel = () => {
    cancelled = true;
    const entry = pending.get(id);
    if (entry) {
      pending.delete(id);
      entry.resolve(null);
    }
  };

  return promise;
}

/** Test helper */
export function _resetHighlightWorkerForTests(): void {
  try {
    worker?.terminate();
  } catch {
    // ignore
  }
  worker = null;
  workerFailed = false;
  requestSeq = 0;
  pending.clear();
}
