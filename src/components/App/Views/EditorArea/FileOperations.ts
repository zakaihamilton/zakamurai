type FileOperationDraft = {
  pendingFileOperations?: Record<string, string>;
};

type FileOperationUpdate<T extends FileOperationDraft> = (update: (draft: T) => void) => void;

const createOperationToken = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function acquireFileOperation<T extends FileOperationDraft>(
  update: FileOperationUpdate<T>,
  filePath: string,
): string | null {
  const token = createOperationToken();
  let acquired = false;
  update((draft) => {
    if (draft.pendingFileOperations?.[filePath]) return;
    draft.pendingFileOperations = {
      ...draft.pendingFileOperations,
      [filePath]: token,
    };
    acquired = true;
  });
  return acquired ? token : null;
}

export function releaseFileOperation<T extends FileOperationDraft>(
  update: FileOperationUpdate<T>,
  filePath: string,
  token: string,
): void {
  update((draft) => {
    if (draft.pendingFileOperations?.[filePath] !== token) return;
    const next = { ...draft.pendingFileOperations };
    delete next[filePath];
    draft.pendingFileOperations = Object.keys(next).length ? next : undefined;
  });
}

export async function runWithFileOperation<T extends FileOperationDraft, TResult>(
  update: FileOperationUpdate<T>,
  filePath: string,
  operation: () => Promise<TResult> | TResult,
): Promise<TResult | undefined> {
  const token = acquireFileOperation(update, filePath);
  if (!token) return undefined;
  try {
    return await operation();
  } finally {
    releaseFileOperation(update, filePath, token);
  }
}
