/* eslint-disable no-restricted-globals */
import { highlightCode } from './highlighter';
import type { HighlightWorkerMessage, HighlightWorkerResponse } from './types';

self.onmessage = (event: MessageEvent<HighlightWorkerMessage>) => {
  const {
    id,
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
  } = event.data || {};

  try {
    const html = highlightCode(
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
    const response: HighlightWorkerResponse = { id, html };
    self.postMessage(response);
  } catch (error) {
    const response: HighlightWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
