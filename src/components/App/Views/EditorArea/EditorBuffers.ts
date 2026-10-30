import type { EditorStateShape } from '@/types/domain-types';
import {
  deleteInDraft,
  deleteKeysWithPrefixInDraft,
  remapKeysInDraft,
  setInDraft,
} from '@/utils/StateUtils';
import type { Draft } from 'triactor';

export type EditorBufferSource = {
  fileContents?: Record<string, string>;
  dirtyBufferContents?: Record<string, string>;
  pendingDiffs?: Record<string, unknown>;
  pendingDeletions?: Record<string, unknown>;
};

export type EditorBufferDraft<T extends object = EditorStateShape> = Draft<T>;

export const EDITOR_PATH_MAPS = [
  'fileContents',
  'dirtyBufferContents',
  'pendingDiffs',
  'pendingDeletions',
  'history',
  'cursorPos',
  'selectedLines',
  'isCompleting',
  'completionActivity',
];

const matchesPathPrefix = (path: string, pathPrefix: string) =>
  path === pathPrefix || path.startsWith(`${pathPrefix}/`);

const remapPathPrefix = (path: string, oldPrefix: string, newPrefix: string) =>
  matchesPathPrefix(path, oldPrefix) ? newPrefix + path.substring(oldPrefix.length) : path;

/** Remaps all editor state associated with a renamed or moved project path. */
export function remapEditorPathStateInDraft<T extends object>(
  draft: Draft<T>,
  oldPrefix: string,
  newPrefix: string,
): void {
  remapKeysInDraft(draft, EDITOR_PATH_MAPS, oldPrefix, newPrefix);
  const pathState = draft as Draft<{
    shouldScrollTo?: { filePath: string; line: number; timestamp: number } | null;
    aiCompletionDebug?: { filePath: string };
    navigationHistory?: {
      stack: Array<{ filePath: string; label: string }>;
      currentIndex: number;
    };
  }>;
  if (pathState.shouldScrollTo && matchesPathPrefix(pathState.shouldScrollTo.filePath, oldPrefix)) {
    pathState.shouldScrollTo = {
      ...pathState.shouldScrollTo,
      filePath: remapPathPrefix(pathState.shouldScrollTo.filePath, oldPrefix, newPrefix),
    };
  }
  if (
    pathState.aiCompletionDebug &&
    matchesPathPrefix(pathState.aiCompletionDebug.filePath, oldPrefix)
  ) {
    pathState.aiCompletionDebug = {
      ...pathState.aiCompletionDebug,
      filePath: remapPathPrefix(pathState.aiCompletionDebug.filePath, oldPrefix, newPrefix),
    };
  }
  if (pathState.navigationHistory) {
    pathState.navigationHistory = {
      ...pathState.navigationHistory,
      stack: pathState.navigationHistory.stack.map((entry) => {
        const filePath = remapPathPrefix(entry.filePath, oldPrefix, newPrefix);
        return {
          ...entry,
          filePath,
          ...(filePath !== entry.filePath
            ? { label: filePath.split('/').at(-1) || entry.label }
            : {}),
        };
      }),
    };
  }
}

/** Clears all editor state associated with a deleted file or folder path. */
export function removeEditorPathStateInDraft<T extends object>(
  draft: Draft<T>,
  pathPrefix: string,
): void {
  deleteKeysWithPrefixInDraft(draft, EDITOR_PATH_MAPS, pathPrefix);
  const pathState = draft as Draft<{
    shouldScrollTo?: { filePath: string; line: number; timestamp: number } | null;
    aiCompletionDebug?: { filePath: string };
    navigationHistory?: {
      stack: Array<{ filePath: string; label: string }>;
      currentIndex: number;
    };
  }>;
  if (
    pathState.shouldScrollTo &&
    matchesPathPrefix(pathState.shouldScrollTo.filePath, pathPrefix)
  ) {
    pathState.shouldScrollTo = null;
  }
  if (
    pathState.aiCompletionDebug &&
    matchesPathPrefix(pathState.aiCompletionDebug.filePath, pathPrefix)
  ) {
    pathState.aiCompletionDebug = undefined;
  }
  const history = pathState.navigationHistory;
  if (history) {
    const removedBeforeCurrent = history.stack
      .slice(0, Math.max(history.currentIndex + 1, 0))
      .filter((entry) => matchesPathPrefix(entry.filePath, pathPrefix)).length;
    const stack = history.stack.filter((entry) => !matchesPathPrefix(entry.filePath, pathPrefix));
    if (stack.length !== history.stack.length) {
      pathState.navigationHistory = {
        stack,
        currentIndex: Math.min(
          Math.max(history.currentIndex - removedBeforeCurrent, -1),
          stack.length - 1,
        ),
      };
    }
  }
}

export function readEffectiveFileContent(
  state: EditorBufferSource | null | undefined,
  path: string,
): string | undefined {
  const dirty = state?.dirtyBufferContents;
  if (dirty && Object.hasOwn(dirty, path)) return dirty[path];
  return state?.fileContents?.[path];
}

/** Materializes the current editor buffers for an explicit action or persistence boundary. */
export function createEffectiveFileContentsSnapshot(
  state: EditorBufferSource | null | undefined,
): Record<string, string> {
  return { ...(state?.fileContents || {}), ...(state?.dirtyBufferContents || {}) };
}

/** Materializes proposed editor buffers while omitting files pending deletion. */
export function createEffectivePreviewFileContentsSnapshot(
  state: EditorBufferSource | null | undefined,
): Record<string, string> {
  const snapshot = createEffectiveFileContentsSnapshot(state);
  for (const path of Object.keys(state?.pendingDeletions || {})) delete snapshot[path];
  return snapshot;
}

/** Overlays only unsaved or proposed editor paths on top of a local disk snapshot. */
export function mergeWorkspaceDiskFiles(
  diskFiles: Record<string, string>,
  state: EditorBufferSource | null | undefined,
  additionalOverlayPaths: string[] = [],
): Record<string, string> {
  const files = { ...diskFiles };
  const effectiveContents = createEffectiveFileContentsSnapshot(state);
  const overlayPaths = new Set([
    ...Object.keys(state?.dirtyBufferContents || {}),
    ...Object.keys(state?.pendingDiffs || {}),
    ...additionalOverlayPaths,
  ]);
  for (const path of overlayPaths) {
    if (Object.hasOwn(effectiveContents, path)) files[path] = effectiveContents[path];
  }
  for (const path of Object.keys(state?.pendingDeletions || {})) delete files[path];
  return files;
}

/** A read-only, no-copy view for render-time consumers such as editor navigation. */
export function createEffectiveFileContentsView(
  state: EditorBufferSource | null | undefined,
): Record<string, string> {
  const base = state?.fileContents || {};
  const dirty = state?.dirtyBufferContents || {};
  if (Object.keys(dirty).length === 0) return base;

  return new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'string' && Object.hasOwn(dirty, property)) {
        return dirty[property];
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      return (
        (typeof property === 'string' && Object.hasOwn(dirty, property)) ||
        Reflect.has(target, property)
      );
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(dirty)])];
    },
    getOwnPropertyDescriptor(target, property) {
      if (typeof property === 'string' && Object.hasOwn(dirty, property)) {
        return { configurable: true, enumerable: true, value: dirty[property], writable: false };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  });
}

/** A no-iteration overlay for resolvers that only read specific file paths. */
export function createEffectiveFileContentsLookup(
  state: EditorBufferSource | null | undefined,
): Record<string, string> {
  const base = state?.fileContents || {};
  const dirty = state?.dirtyBufferContents || {};

  return new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'string' && Object.hasOwn(dirty, property)) {
        return dirty[property];
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      return (
        (typeof property === 'string' && Object.hasOwn(dirty, property)) ||
        Reflect.has(target, property)
      );
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  });
}

export function setDirtyBufferInDraft<T extends object>(
  draft: EditorBufferDraft<T>,
  path: string,
  content: string,
): void {
  setInDraft(draft, ['dirtyBufferContents', path], content);
}

export function clearDirtyBufferInDraft<T extends object>(
  draft: EditorBufferDraft<T>,
  path: string,
): void {
  deleteInDraft(draft, ['dirtyBufferContents'], path);
}

/** Commits dirty editor buffers into the serialized workspace map at an action boundary. */
export function commitDirtyBufferContentsInDraft<
  T extends { fileContents?: Record<string, string>; dirtyBufferContents?: Record<string, string> },
>(draft: EditorBufferDraft<T>, expected?: Record<string, string>): void {
  const writable = draft as unknown as {
    fileContents?: Record<string, string>;
    dirtyBufferContents?: Record<string, string>;
  };
  const dirty = writable.dirtyBufferContents || {};
  const entries = Object.entries(expected || dirty).filter(
    ([path, content]) => Object.hasOwn(dirty, path) && dirty[path] === content,
  );
  if (entries.length === 0) return;

  const fileContents = { ...(writable.fileContents || {}) };
  const remainingDirty = { ...dirty };
  for (const [path, content] of entries) {
    fileContents[path] = content;
    delete remainingDirty[path];
  }
  writable.fileContents = fileContents;
  writable.dirtyBufferContents = remainingDirty;
}
