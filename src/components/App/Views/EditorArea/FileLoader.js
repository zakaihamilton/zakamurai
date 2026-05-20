import { useEffect, useRef } from 'react';
import { getImportRanges, resolveRelativePath } from '@/utils/navigation';

export default function useFileLoader({
  filePath,
  localContent,
  setLocalContent,
  fallbackContent,
  fs,
  fsHandle,
  state,
}) {
  const localContentRef = useRef(localContent);
  const loadedLocalFileRef = useRef(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  // Sync localContent when state.fileContents changes externally (e.g. from AI)
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

      const content = await fs.readFile(handle);
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

  // Background load referenced and sibling files to resolve navigation links
  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile || !localContent)
      return;

    const isCss = filePath.endsWith('.css');
    const importRanges = getImportRanges(localContent, isCss);

    const loadReferencedFiles = async () => {
      // 1. Load imported files
      for (const range of importRanges) {
        let resolved = range.path;
        if (range.path.startsWith('@/')) {
          resolved = range.path.replace(/^@\//, 'src/');
        } else if (range.path.startsWith('.')) {
          resolved = resolveRelativePath(filePath, range.path);
        }

        const candidates = [
          resolved,
          `${resolved}.js`,
          `${resolved}.jsx`,
          `${resolved}.ts`,
          `${resolved}.tsx`,
          `${resolved}.css`,
          `${resolved}.json`,
          `${resolved}.svg`,
          `${resolved}.png`,
          `${resolved}.jpg`,
          `${resolved}.jpeg`,
          `${resolved}/index.js`,
          `${resolved}/index.jsx`,
          `${resolved}/index.ts`,
          `${resolved}/index.tsx`,
        ];

        for (const candidate of candidates) {
          if (candidate === filePath) continue;
          if (state.fileContents?.[candidate] !== undefined) {
            break;
          }

          try {
            const handle = await fs.getFileHandleAtPath?.(candidate);
            if (handle) {
              const content = await fs.readFile(handle);
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

      // 2. Sibling JS/JSX/TS/TSX file discovery for CSS module targets
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
                const content = await fs.readFile(handle);
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
