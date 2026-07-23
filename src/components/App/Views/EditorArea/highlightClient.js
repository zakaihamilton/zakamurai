/**
 * Highlight worker client — offloads tokenization from the main thread.
 * Falls back to synchronous highlightCode when Workers are unavailable.
 */

import highlighterStyles from './Highlighter.module.css';
import { highlightCode } from './highlighter';

/** Prefer worker for buffers above this size (chars). */
export const HIGHLIGHT_WORKER_THRESHOLD = 4000;

let worker = null;
let workerFailed = false;
let requestSeq = 0;
const pending = new Map();

const stylePayload = () => ({ ...highlighterStyles });

function runSync(
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
) {
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

function settlePendingWithFallback() {
  for (const [, entry] of pending) {
    try {
      entry.resolve(entry.fallback());
    } catch {
      entry.resolve('');
    }
  }
  pending.clear();
}

function getWorker() {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./highlight.worker.js', import.meta.url));
    worker.onmessage = (event) => {
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
      entry.resolve(html);
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
  isOriginal = false,
) {
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

/**
 * @returns {Promise<string|null> & { cancel?: () => void }}
 * Resolves to HTML, or null when cancelled. Never rejects — falls back to sync on worker failure.
 */
export function highlightCodeAsync(
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
  isOriginal = false,
) {
  if (!code) {
    const empty = Promise.resolve('');
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
    const syncResult = Promise.resolve(fallback());
    syncResult.cancel = () => {};
    return syncResult;
  }

  const w = getWorker();
  if (!w) {
    const syncResult = Promise.resolve(fallback());
    syncResult.cancel = () => {};
    return syncResult;
  }

  const id = ++requestSeq;
  // Avoid cloning the entire project into the worker unless navigation links need it.
  const fileContentsForWorker = navigationLinksEnabled ? state?.fileContents || {} : {};
  const payload = {
    id,
    code,
    filePath,
    state: {
      pendingDiffs: state?.pendingDiffs || {},
      selectedLines: state?.selectedLines || {},
      fileContents: fileContentsForWorker,
    },
    styles: styles ?? stylePayload(),
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  };

  let cancelled = false;
  const promise = new Promise((resolve) => {
    pending.set(id, {
      resolve,
      fallback,
      get cancelled() {
        return cancelled;
      },
    });
    try {
      w.postMessage(payload);
    } catch (_e) {
      pending.delete(id);
      resolve(cancelled ? null : fallback());
    }
  });

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
export function _resetHighlightWorkerForTests() {
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
