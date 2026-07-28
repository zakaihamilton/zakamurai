export const parseStoredJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const serializeOpenTabs = (tabs) =>
  tabs.map((tab) => ({
    id: tab.id,
    type: tab.type,
    label: tab.label,
    ...(tab.viewType ? { viewType: tab.viewType } : {}),
    ...(tab.file ? { file: { name: tab.file.name, path: tab.file.path } } : {}),
    ...(tab.sourceFilePath ? { sourceFilePath: tab.sourceFilePath } : {}),
  }));

export const normalizePromptHistory = (history) =>
  Array.isArray(history)
    ? history
        .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
        .filter(Boolean)
        .filter((prompt, index, prompts) => prompts.indexOf(prompt) === index)
        .slice(0, 50)
    : [];

export const normalizePendingDiffs = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(([, diff]) => {
      if (!diff || typeof diff !== 'object' || typeof diff.originalContent !== 'string') {
        return false;
      }
      if (typeof diff.modifiedContent !== 'string' || !Array.isArray(diff.diffs)) return false;
      return diff.diffs.every(
        (range) =>
          range &&
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          Number.isFinite(range.origStart) &&
          Number.isFinite(range.origEnd),
      );
    }),
  );
};
