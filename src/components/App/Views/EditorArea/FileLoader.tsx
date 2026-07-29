import { getImportPathCandidates, getImportRanges, resolveRelativePath } from '@/utils/navigation';
import { useEffect, useRef } from 'react';
import type { FileLoaderProps } from './types';

export default function useFileLoader({
  filePath,
  localContent,
  setLocalContent,
  fallbackContent,
  fs,
  fsHandle,
  state,
}: FileLoaderProps) {
  const localContentRef = useRef(localContent);
  const loadedLocalFileRef = useRef<string | null>(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    const externalContent = state.fileContents?.[filePath] ?? fallbackContent;
    if (externalContent !== localContent) {
      setLocalContent(externalContent);
    }
  }, [state.fileContents?.[filePath], filePath, fallbackContent, localContent, setLocalContent]);

  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile) return;
    if (loadedLocalFileRef.current === filePath) return;

    let cancelled = false;
    const startingContent = localContentRef.current;
    const loadContent = async () => {
      const handle = fsHandle || (await fs.getFileHandleAtPath?.(filePath));
      if (!handle || cancelled) return;

      const content = await fs.readFile?.(handle);
      if (cancelled) return;

      loadedLocalFileRef.current = filePath;
      setLocalContent((current) => (current === startingContent ? content : current));
      state((draft) => {
        if (localContentRef.current === startingContent) {
          draft.fileContents = { ...draft.fileContents, [filePath]: content };
        }
      });
    };

    loadContent().catch((err) => {
      console.error(`Failed to load editor content for ${filePath}`, err);
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, fs, fsHandle, state, setLocalContent]);

  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile || !localContent)
      return;

    const isCss = filePath.endsWith('.css');
    const importRanges = getImportRanges(localContent, isCss);

    const loadReferencedFiles = async () => {
      for (const range of importRanges) {
        let resolved = range.path;
        if (range.path.startsWith('@/')) {
          resolved = range.path.replace(/^@\//, 'src/');
        } else if (range.path.startsWith('.')) {
          resolved = resolveRelativePath(filePath, range.path);
        }

        const candidates = getImportPathCandidates(resolved);

        for (const candidate of candidates) {
          if (candidate === filePath) continue;
          if (state.fileContents?.[candidate] !== undefined) {
            break;
          }

          try {
            const handle = await fs.getFileHandleAtPath?.(candidate);
            if (handle) {
              const content = await fs.readFile?.(handle);
              state((draft) => {
                draft.fileContents = {
                  ...draft.fileContents,
                  [candidate]: content,
                };
              });
              break;
            }
          } catch (_e) {
            // Sibling candidate doesn't exist, check next extension
          }
        }
      }

      if (isCss) {
        const lastSlash = filePath.lastIndexOf('/');
        const dirPath = lastSlash !== -1 ? filePath.substring(0, lastSlash) : '';
        const fileName = lastSlash !== -1 ? filePath.substring(lastSlash + 1) : filePath;
        const baseName = fileName.replace(/\.module\.css$/, '').replace(/\.css$/, '');

        if (dirPath && baseName) {
          const siblingCandidates = [
            `${dirPath}/${baseName}.js`,
            `${dirPath}/${baseName}.jsx`,
            `${dirPath}/${baseName}.ts`,
            `${dirPath}/${baseName}.tsx`,
            `${dirPath}/index.js`,
            `${dirPath}/index.jsx`,
            `${dirPath}/index.ts`,
            `${dirPath}/index.tsx`,
          ];

          for (const candidate of siblingCandidates) {
            if (candidate === filePath) continue;
            if (state.fileContents?.[candidate] !== undefined) continue;

            try {
              const handle = await fs.getFileHandleAtPath?.(candidate);
              if (handle) {
                const content = await fs.readFile?.(handle);
                state((draft) => {
                  draft.fileContents = {
                    ...draft.fileContents,
                    [candidate]: content,
                  };
                });
              }
            } catch (_e) {
              // Sibling candidate doesn't exist, skip
            }
          }
        }
      }
    };

    loadReferencedFiles().catch((err) => {
      console.error('Error pre-loading referenced files:', err);
    });
  }, [filePath, localContent, fs, state]);
}
