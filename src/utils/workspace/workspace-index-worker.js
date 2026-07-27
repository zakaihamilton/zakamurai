import { extractImports, extractSymbols, getLanguage, isIndexablePath } from './symbols';

const files = new Map();

const normalize = (value) => String(value || '').toLowerCase();

function scoreText(query, path, content) {
  const needle = normalize(query);
  const haystack = normalize(content);
  const pathScore = normalize(path).includes(needle) ? 8 : 0;
  let occurrences = 0;
  let offset = haystack.indexOf(needle);
  while (offset !== -1 && occurrences < 20) {
    occurrences++;
    offset = haystack.indexOf(needle, offset + needle.length);
  }
  return pathScore + occurrences;
}

function applyChanges(entries = []) {
  for (const entry of entries) {
    if (entry.deleted) {
      files.delete(entry.path);
      continue;
    }
    const content = String(entry.content || '');
    files.set(entry.path, {
      path: entry.path,
      hash: entry.hash,
      bytes: entry.bytes ?? new Blob([content]).size,
      language: getLanguage(entry.path),
      content,
      symbols: isIndexablePath(entry.path) ? extractSymbols(entry.path, content) : [],
      imports: extractImports(content),
    });
  }
}

function queryText(query, limit = 50) {
  return [...files.values()]
    .map((file) => ({ ...file, score: scoreText(query, file.path, file.content) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ content, ...file }) => ({
      ...file,
      preview: content.slice(Math.max(0, normalize(content).indexOf(normalize(query)) - 100), 400),
    }));
}

self.addEventListener('message', (event) => {
  const { id, type, payload = {} } = event.data;
  try {
    if (type === 'APPLY') {
      applyChanges(payload.entries);
      self.postMessage({ id, type: 'SUCCESS', payload: { indexedFiles: files.size } });
      return;
    }
    if (type === 'QUERY_TEXT') {
      self.postMessage({ id, type: 'SUCCESS', payload: queryText(payload.query, payload.limit) });
      return;
    }
    if (type === 'SYMBOLS') {
      const needle = normalize(payload.query);
      const result = [...files.values()].flatMap((file) =>
        file.symbols
          .filter((symbol) => normalize(symbol.name).includes(needle))
          .map((symbol) => ({ ...symbol, path: file.path })),
      );
      self.postMessage({ id, type: 'SUCCESS', payload: result.slice(0, payload.limit || 100) });
      return;
    }
    if (type === 'HEALTH') {
      const values = [...files.values()];
      self.postMessage({
        id,
        type: 'SUCCESS',
        payload: {
          totalFiles: values.length,
          indexedBytes: values.reduce((total, file) => total + file.bytes, 0),
        },
      });
      return;
    }
    throw new Error(`Unknown workspace index action: ${type}`);
  } catch (error) {
    self.postMessage({ id, type: 'ERROR', error: error.message });
  }
});
