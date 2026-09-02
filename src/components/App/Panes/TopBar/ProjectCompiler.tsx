import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { reportDiagnostic } from '@/components/Diagnostics';
import { markPerformance, measurePerformance } from '@/components/Performance';
import { useFileSystem } from '@/components/Storage';
import { ProblemsState } from '@/components/Workspace';
import { useNotification } from '@/components/ui/Notification';
import { normalizeCompilerDiagnostic } from '@/utils/compiler/diagnostics';
import { useCallback, useEffect, useRef } from 'react';
import { requireStore, toCompilerFs } from '../../types';

/** Lazy-load compiler (almostnode / browser-bundler) only on build / clear. */
const loadCompiler = () => import('@/utils/compiler');
const PHASE_LABELS: Record<string, string> = {
  initializing: 'Initializing browser runtime…',
  syncing: 'Syncing project files…',
  installing: 'Installing dependencies…',
  bundling: 'Bundling project…',
  executing: 'Running build command…',
  timeout: 'Build timed out',
  error: 'Build failed',
};
const AI_PREVIEW_MARKER = /\n<!-- zakamurai-ai-preview:\d+ -->$/;

export default function useProjectCompiler() {
  const appState = requireStore(AppState.useState(['compileRequest', 'silentCompileRequest']));
  const { compileRequest, silentCompileRequest } = appState;
  const fs = useFileSystem();
  const tabState = requireStore(TabState.usePassiveState());
  const { folderTree } = requireStore(SidebarState.useState(['folderTree']));
  const editorState = requireStore(EditorState.usePassiveState());
  const logState = requireStore(LogState.usePassiveState());
  const previewState = requireStore(PreviewState.usePassiveState());
  const problemsState = requireStore(ProblemsState.usePassiveState());
  const { isSystemProcessing } = requireStore(LogState.useState(['isSystemProcessing']));
  const { addNotification } = useNotification();
  const isCompilingRef = useRef(false);
  const isRebuildingRef = useRef(false);
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
      markPerformance('build-start');

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

      const logQueue: string[] = [];
      let logTimer: ReturnType<typeof setTimeout> | null = null;

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

      const onLog = (text: string) => {
        logQueue.push(text);
        if (!logTimer) {
          logTimer = setTimeout(() => {
            flushLogs();
            logTimer = null;
          }, 100);
        }
      };

      const onPhase = (phase: string) => {
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
        const localFs = toCompilerFs(fs);
        // Build/Preview compile proposed editor buffers, including unapproved AI diffs.
        await compiler.compile(localFs, folderTree, editorState.fileContents);
        problemsState((draft) => {
          draft.items = [];
        });
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
              container.vfs.writeFileSync('/index.html', html);
              previewState((draft) => {
                const currentHtml = draft.htmlContent || '';
                const canPreserveAIInspection =
                  isSilent && currentHtml.replace(AI_PREVIEW_MARKER, '') === html;
                if (!canPreserveAIInspection) {
                  draft.htmlContent = html;
                }
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
              markPerformance('build-ready');
              measurePerformance('build-to-preview', 'build-start', 'build-ready');
            }
          }
        } catch (previewErr) {
          const message = previewErr instanceof Error ? previewErr.message : String(previewErr);
          onLog(`[WARN] Could not load preview: ${message}`);
        }
      } catch (err) {
        const diagnostic = normalizeCompilerDiagnostic(err);
        reportDiagnostic({
          source: 'compiler',
          severity: 'error',
          message: diagnostic.message,
        });
        problemsState((draft) => {
          draft.items = [
            {
              source: 'build',
              severity: 'error',
              message: diagnostic.message,
              location: diagnostic.location,
              createdAt: Date.now(),
            },
          ];
        });
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
      problemsState,
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
        draft.isCompilerReady = false;
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      reportDiagnostic({ source: 'compiler', severity: 'error', message: errorMsg });
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

  const handleRebuild = useCallback(async () => {
    if (isSystemProcessingRef.current || isCompilingRef.current || isRebuildingRef.current) return;
    isRebuildingRef.current = true;

    try {
      const { Compiler } = await loadCompiler();
      await Compiler.reset();
      previewState((draft) => {
        draft.isCompilerReady = false;
      });
      await handleCompile();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      reportDiagnostic({ source: 'compiler', severity: 'error', message: errorMsg });
      addNotification(`Failed to rebuild: ${errorMsg}`, 'error');
      logState((draft) => {
        draft.logs = [
          ...draft.logs,
          {
            id: `${Date.now()}-${Math.random()}`,
            role: 'system',
            text: `Failed to rebuild: ${errorMsg}`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });
      handleOpenLog();
    } finally {
      isRebuildingRef.current = false;
    }
  }, [handleCompile, previewState, logState, handleOpenLog, addNotification]);

  return {
    handleCompile,
    handleRebuild,
    handleOpenLog,
    handleOpenPreview,
    handleClearFS,
  };
}
