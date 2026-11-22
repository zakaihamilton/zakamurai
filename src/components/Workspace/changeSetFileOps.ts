import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import { removeLastCodeTabPathInDraft } from '@/components/App/Panes/TabBar/TabStateUtils';
import type { TabStateShape } from '@/types/domain-types';

export type ChangeSetFileSystem = {
  rootHandle?: FileSystemDirectoryHandle | null;
  readFileAtPath?: (path: string, root?: FileSystemDirectoryHandle | null) => Promise<string>;
  writeFileAtPath?: (
    path: string,
    content: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<boolean | undefined>;
  deleteFileAtPath?: (
    path: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<boolean | undefined>;
  getFileHandleAtPath?: (
    path: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<FileSystemFileHandle | null>;
};

export type PendingDiffSnapshot = {
  originalContent: string;
  modifiedContent: string;
  isNewFile?: boolean;
  changeSetId?: string;
};

export type PendingDeletionSnapshot =
  | boolean
  | {
      originalContent?: string;
      changeSetId?: string;
    };

export type StoreUpdater<T> = ((updater: (draft: T) => void) => void) & T;

export async function hasExternalConflict(
  fs: ChangeSetFileSystem | null | undefined,
  path: string,
  expected: string,
  rootHandle: FileSystemDirectoryHandle | null | undefined = fs?.rootHandle,
): Promise<boolean> {
  if (!rootHandle || !fs?.readFileAtPath) return false;
  try {
    return (await fs.readFileAtPath(path, rootHandle)) !== expected;
  } catch {
    return true;
  }
}

export async function hasUnexpectedFile(
  fs: ChangeSetFileSystem | null | undefined,
  path: string,
  rootHandle: FileSystemDirectoryHandle | null | undefined = fs?.rootHandle,
  options?: { catchErrors?: boolean },
): Promise<boolean> {
  if (!rootHandle) return false;
  if (!fs?.getFileHandleAtPath) return true;
  if (options?.catchErrors === false) {
    return Boolean(await fs.getFileHandleAtPath(path, rootHandle));
  }
  try {
    return Boolean(await fs.getFileHandleAtPath(path, rootHandle));
  } catch {
    return true;
  }
}

export function isSamePendingDiff(
  current: PendingDiffSnapshot | undefined,
  expected: PendingDiffSnapshot,
): boolean {
  return Boolean(
    current &&
      current.changeSetId === expected.changeSetId &&
      current.originalContent === expected.originalContent &&
      current.modifiedContent === expected.modifiedContent &&
      current.isNewFile === expected.isNewFile,
  );
}

export function isSamePendingDeletion(
  current: PendingDeletionSnapshot | undefined,
  expected: PendingDeletionSnapshot,
): boolean {
  if (typeof expected === 'object' && expected !== null) {
    return Boolean(
      current &&
        typeof current === 'object' &&
        current.changeSetId === expected.changeSetId &&
        current.originalContent === expected.originalContent,
    );
  }
  return current === expected;
}

const matchesRemovedPath = (candidatePath: string, removedPaths: string[]): boolean =>
  removedPaths.some((path) => candidatePath === path || candidatePath.startsWith(`${path}/`));

export function removePathsFromTabsAndSidebar({
  paths,
  tabState,
  sidebarState,
  updateActiveTab = true,
}: {
  paths: string[];
  tabState?: ((updater: (draft: TabStateShape) => void) => void) | null;
  sidebarState?: ((updater: (draft: { folderTree?: unknown[] }) => void) => void) | null;
  updateActiveTab?: boolean;
}): void {
  if (!paths.length) return;
  sidebarState?.((draft) => {
    for (const path of paths) {
      if (draft.folderTree) {
        draft.folderTree = removeNodeAtPath(
          draft.folderTree as Parameters<typeof removeNodeAtPath>[0],
          path.split('/').filter(Boolean),
        );
      }
    }
  });
  tabState?.((draft) => {
    draft.openTabs = draft.openTabs.filter((tab) => !matchesRemovedPath(tab.id, paths));
    if (updateActiveTab && draft.activeTabId && matchesRemovedPath(draft.activeTabId, paths)) {
      draft.activeTabId = draft.openTabs.at(-1)?.id || null;
    }
    removeLastCodeTabPathInDraft(draft, paths);
  });
}
