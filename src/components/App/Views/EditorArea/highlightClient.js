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
      if (error) entry.reject(new Error(error));
      else entry.resolve(html);
    };
    worker.onerror = () => {
      workerFailed = true;
      for (const [, entry] of pending) {
        entry.reject(new Error('Highlight worker failed'));
      }
      pending.clear();
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

/**
 * @returns {Promise<string>}
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
  if (!code) return Promise.resolve('');
  if (code.length <= HIGHLIGHT_WORKER_THRESHOLD) {
    return Promise.resolve(
      highlightCodeSync(
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
      ),
    );
  }

  const w = getWorker();
  if (!w) {
    return Promise.resolve(
      highlightCodeSync(
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
      ),
    );
  }

  const id = ++requestSeq;
  const payload = {
    id,
    code,
    filePath,
    state: {
      pendingDiffs: state?.pendingDiffs || {},
      selectedLines: state?.selectedLines || {},
      fileContents: navigationLinksEnabled ? state?.fileContents || {} : {},
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

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage(payload);
    } catch (_e) {
      pending.delete(id);
      resolve(
        highlightCodeSync(
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
        ),
      );
    }
  });
}
