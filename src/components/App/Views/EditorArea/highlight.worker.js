/* eslint-disable no-restricted-globals */
import { highlightCode } from './highlighter';

self.onmessage = (event) => {
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
    self.postMessage({ id, html });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
