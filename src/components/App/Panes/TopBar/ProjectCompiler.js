import Settings from '@/components/Storage/Settings';
import { useNotification } from '@/components/ui/Notification/Notification';
import { Compiler } from '@/utils/compiler';
import { useCallback, useEffect, useRef } from 'react';

export default function useProjectCompiler(
  appState,
  tabState,
  sidebarState,
  editorState,
  logState,
  previewState,
  isSystemProcessing,
) {
  const { fs, compileRequest, silentCompileRequest } = appState;
  const { folderTree } = sidebarState;
  const { addNotification } = useNotification();
  const isCompilingRef = useRef(false);
  const lastCompileRequestRef = useRef(0);
  const lastSilentCompileRequestRef = useRef(0);

  const isSystemProcessingRef = useRef(isSystemProcessing);
  useEffect(() => {
    isSystemProcessingRef.current = isSystemProcessing;
  }, [isSystemProcessing]);

  const handleOpenLog = useCallback(() => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'ai-logs');
      if (!exists) {
        draft.openTabs = [...draft.openTabs, { id: 'ai-logs', type: 'logs', label: 'Logs' }];
      }
      draft.activeTabId = 'ai-logs';
    });
  }, [tabState]);

  const handleOpenPreview = useCallback(() => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'preview');
      if (!exists) {
        draft.openTabs = [...draft.openTabs, { id: 'preview', type: 'preview', label: 'Preview' }];
      }
      draft.activeTabId = 'preview';
    });
  }, [tabState]);

  const handleCompile = useCallback(
    async (silent = false) => {
      const isSilent = silent === true;
      if (isSystemProcessingRef.current || isCompilingRef.current) return;
      isCompilingRef.current = true;

      logState((draft) => {
        draft.isSystemProcessing = true;
      });

      if (!isSilent && tabState.activeTabId !== 'ai-logs') {
        handleOpenLog();
      }

      const logQueue = [];
      let logTimer = null;

      const flushLogs = () => {
        if (logQueue.length === 0) return;
        const batch = [...logQueue];
        logQueue.length = 0;
        logState((draft) => {
          draft.logs = [
            ...draft.logs,
            ...batch.map((text) => ({
              id: `${Date.now()}-${Math.random()}`,
              role: 'system',
              text,
              timestamp: new Date().toTimeString().split(' ')[0],
            })),
          ];
        });
      };

      const onLog = (text) => {
        logQueue.push(text);
        if (!logTimer) {
          logTimer = setTimeout(() => {
            flushLogs();
            logTimer = null;
          }, 100);
        }
      };

      try {
        const compiler = new Compiler(onLog);
        await compiler.compile(fs, folderTree, editorState.fileContents);
        flushLogs();
        addNotification('Project compiled successfully', 'success');

        try {
          const container = compiler.container;
          if (container?.vfs?.existsSync('/dist/index.html')) {
            const html = container.vfs.readFileSync('/dist/index.html', 'utf8');
            if (html) {
              previewState((draft) => {
                draft.htmlContent = html;
                draft.restoreError = null;
                draft.compileError = null;
                draft.serverError = null;
              });
              Settings.setPreviewHtml(html);
              tabState((draft) => {
                const exists = draft.openTabs.some((t) => t.id === 'preview');
                if (!exists) {
                  draft.openTabs = [
                    ...draft.openTabs,
                    { id: 'preview', type: 'preview', label: 'Preview' },
                  ];
                }
                if (!isSilent) {
                  draft.activeTabId = 'preview';
                }
              });
              onLog(`Preview ready.${!isSilent ? ' Opened preview tab.' : ''}`);
            }
          }
        } catch (previewErr) {
          onLog(`[WARN] Could not load preview: ${previewErr.message}`);
        }
      } catch (err) {
        const errorMsg = err?.message || String(err);
        onLog(`Unexpected error: ${errorMsg}`);
        previewState((draft) => {
          draft.compileError = errorMsg;
        });
        addNotification(`Compilation failed: ${errorMsg}`, 'error');
        handleOpenPreview();
        handleOpenLog();
      } finally {
        logState((draft) => {
          draft.isSystemProcessing = false;
        });
        isCompilingRef.current = false;
      }
    },
    [
      fs,
      folderTree,
      editorState,
      logState,
      previewState,
      tabState,
      addNotification,
      handleOpenLog,
      handleOpenPreview,
    ],
  );

  useEffect(() => {
    if (compileRequest > 0 && compileRequest !== lastCompileRequestRef.current) {
      lastCompileRequestRef.current = compileRequest;
      handleCompile();
    }
  }, [compileRequest, handleCompile]);

  useEffect(() => {
    if (silentCompileRequest > 0 && silentCompileRequest !== lastSilentCompileRequestRef.current) {
      lastSilentCompileRequestRef.current = silentCompileRequest;
      handleCompile(true);
    }
  }, [silentCompileRequest, handleCompile]);

  const handleClearFS = useCallback(() => {
    Compiler.reset();
    previewState((draft) => {
      draft.htmlContent = null;
    });
    Settings.setPreviewHtml(null);
    logState((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: `${Date.now()}-${Math.random()}`,
          role: 'system',
          text: 'Virtual filesystem cleared. Next compile will start fresh.',
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
    });
    handleOpenLog();
  }, [previewState, logState, handleOpenLog]);

  return {
    handleCompile,
    handleOpenLog,
    handleOpenPreview,
    handleClearFS,
  };
}
