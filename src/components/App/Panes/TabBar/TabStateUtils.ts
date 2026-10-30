import type { TabStateShape } from '@/types/domain-types';
import type { Draft } from 'triactor';

const matchesPathPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function remapLastCodeTabPathInDraft(
  draft: Draft<TabStateShape>,
  oldPrefix: string,
  newPrefix: string,
): void {
  const path = draft.lastCodeTabId;
  if (path && matchesPathPrefix(path, oldPrefix)) {
    draft.lastCodeTabId = newPrefix + path.substring(oldPrefix.length);
  }
}

export function removeLastCodeTabPathInDraft(
  draft: Draft<TabStateShape>,
  removedPrefixes: string[],
): void {
  const path = draft.lastCodeTabId;
  if (!path || !removedPrefixes.some((prefix) => matchesPathPrefix(path, prefix))) return;
  draft.lastCodeTabId =
    [...draft.openTabs].reverse().find((tab) => tab.type === 'file')?.id ?? null;
}
