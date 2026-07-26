import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import { useNotification } from '@/components/ui/Notification';
import { normalizeCompilerDiagnostic } from '@/utils/compiler/diagnostics';
import { useCallback, useEffect, useRef } from 'react';

/** Lazy-load compiler (almostnode / browser-bundler) only on build / clear. */
const loadCompiler = () => import('@/utils/compiler');
const PHASE_LABELS = {
  initializing: 'Initializing browser runtime…',
  syncing: 'Syncing project files…',
  installing: 'Installing dependencies…',
  bundling: 'Bundling project…',
  executing: 'Running build command…',
  timeout: 'Build timed out',
  error: 'Build failed',
};

export default function useProjectCompiler() {
  const appState = AppState.useState(['compileRequest', 'silentCompileRequest']);
  const { compileRequest, silentCompileRequest } = appState;
  const fs = useFileSystem();
  const tabState = TabState.usePassiveState();
  const { folderTree } = SidebarState.useState(['folderTree']);
  const editorState = EditorState.usePassiveState();
  const logState = LogState.usePassiveState();
  const previewState = PreviewState.usePassiveState();
  const { isSystemProcessing } = LogState.useState(['isSystemProcessing']);
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
      previewState((draft) => {
        draft.compileStatus = 'building';
        draft.compilePhase = isSilent ? 'Silent rebuild' : 'Compiling…';
        draft.containerStatus = 'ready';
        draft.containerError = null;
        draft.compileError = null;
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

      const onPhase = (phase) => {
        previewState((draft) => {
          draft.compilePhase = PHASE_LABELS[phase] || phase;
        });
      };

      try {
        const { Compiler } = await loadCompiler();
        previewState((draft) => {
          draft.containerStatus = 'initializing';
        });
        const compiler = new Compiler(onLog, onPhase);
        await compiler.compile(fs, folderTree, editorState.fileContents);
        flushLogs();
        addNotification('Project compiled successfully', 'success');
        previewState((draft) => {
          draft.compileStatus = 'success';
          draft.compilePhase = null;
          draft.lastCompileAt = Date.now();
          draft.containerStatus = 'ready';
        });

        try {
          const container = compiler.container;
          if (container?.vfs?.existsSync('/dist/index.html')) {
            const html = container.vfs.readFileSync('/dist/index.html', 'utf8');
            if (html) {
              // Mirror production HTML to VFS root so /preview/ also serves the bundle.
              container.vfs.writeFileSync('/index.html', html);
              previewState((draft) => {
                draft.htmlContent = html;
                draft.previewAddress = '/preview/dist/index.html';
                draft.restoreError = null;
                draft.compileError = null;
                draft.serverError = null;
                draft.isCompilerReady = true;
              });
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
        const diagnostic = normalizeCompilerDiagnostic(err);
        const errorMsg = diagnostic.message;
        onLog(`Unexpected error: ${errorMsg}`);
        previewState((draft) => {
          draft.compileError = errorMsg;
          draft.compileDiagnostic = diagnostic.location;
          draft.compileStatus = 'error';
          draft.compilePhase = null;
          draft.containerError = errorMsg;
          draft.containerStatus = 'error';
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

  const handleClearFS = useCallback(async () => {
    try {
      const { Compiler } = await loadCompiler();
      await Compiler.reset();
      previewState((draft) => {
        draft.htmlContent = null;
      });
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
    } catch (err) {
      const errorMsg = err?.message || String(err);
      addNotification(`Failed to clear filesystem: ${errorMsg}`, 'error');
      logState((draft) => {
        draft.logs = [
          ...draft.logs,
          {
            id: `${Date.now()}-${Math.random()}`,
            role: 'system',
            text: `Failed to clear filesystem: ${errorMsg}`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });
    }
  }, [previewState, logState, handleOpenLog, addNotification]);

  return {
    handleCompile,
    handleOpenLog,
    handleOpenPreview,
    handleClearFS,
  };
}
