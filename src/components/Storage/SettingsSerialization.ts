import type { PendingDiff, Tab } from '@/types/domain-types';

export function parseStoredJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const serializeOpenTabs = (tabs: Tab[]) =>
  tabs.map((tab) => ({
    id: tab.id,
    type: tab.type,
    label: tab.label,
    ...(tab.viewType ? { viewType: tab.viewType } : {}),
    ...(tab.file ? { file: { name: tab.file.name, path: tab.file.path } } : {}),
    ...(tab.sourceFilePath ? { sourceFilePath: tab.sourceFilePath } : {}),
  }));

export const normalizePromptHistory = (history: unknown): string[] =>
  Array.isArray(history)
    ? history
        .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
        .filter(Boolean)
        .filter((prompt, index, prompts) => prompts.indexOf(prompt) === index)
        .slice(0, 50)
    : [];

type PendingDiffCandidate = {
  originalContent?: unknown;
  modifiedContent?: unknown;
  diffs?: unknown;
};

type DiffRange = {
  start: number;
  end: number;
  origStart: number;
  origEnd: number;
};

export const normalizePendingDiffs = (parsed: unknown): Record<string, PendingDiff> => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, PendingDiffCandidate>).filter(([, diff]) => {
      if (!diff || typeof diff !== 'object' || typeof diff.originalContent !== 'string') {
        return false;
      }
      if (typeof diff.modifiedContent !== 'string' || !Array.isArray(diff.diffs)) return false;
      return (diff.diffs as DiffRange[]).every(
        (range) =>
          range &&
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          Number.isFinite(range.origStart) &&
          Number.isFinite(range.origEnd),
      );
    }),
  ) as Record<string, PendingDiff>;
};

type PendingDeletionValue = boolean | { originalContent?: string; changeSetId?: string };

export const normalizePendingDeletions = (
  parsed: unknown,
): Record<string, PendingDeletionValue> => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(([, deletion]) => {
      if (typeof deletion === 'boolean') return true;
      if (!deletion || typeof deletion !== 'object' || Array.isArray(deletion)) return false;
      const value = deletion as Record<string, unknown>;
      return (
        (value.originalContent === undefined || typeof value.originalContent === 'string') &&
        (value.changeSetId === undefined || typeof value.changeSetId === 'string')
      );
    }),
  ) as Record<string, PendingDeletionValue>;
};
