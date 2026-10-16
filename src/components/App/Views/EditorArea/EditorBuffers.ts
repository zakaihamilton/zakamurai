import type { EditorStateShape } from '@/types/domain-types';
import { deleteInDraft, setInDraft } from '@/utils/StateUtils';
import type { Draft } from 'triactor';

export type EditorBufferSource = {
  fileContents?: Record<string, string>;
  dirtyBufferContents?: Record<string, string>;
};

export type EditorBufferDraft<T extends object = EditorStateShape> = Draft<T>;

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
