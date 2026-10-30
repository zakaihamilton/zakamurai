import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { createEffectivePreviewFileContentsSnapshot } from '@/components/App/Views/EditorArea/EditorBuffers';
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
type PendingCompileRequest = { silent: boolean; workspaceEpoch: number };

export default function useProjectCompiler() {
  const appState = requireStore(
    AppState.useState(['compileRequest', 'silentCompileRequest', 'workspaceEpoch']),
  );
  const { compileRequest, silentCompileRequest, workspaceEpoch = 0 } = appState;
  const fs = useFileSystem();
  const currentRootHandleRef = useRef(fs.rootHandle);
  currentRootHandleRef.current = fs.rootHandle;
  const tabState = requireStore(TabState.usePassiveState());
  const { folderTree } = requireStore(SidebarState.useState(['folderTree']));
  const editorState = requireStore(EditorState.usePassiveState());
  const logState = requireStore(LogState.usePassiveState());
  const previewState = requireStore(PreviewState.usePassiveState());
  const problemsState = requireStore(ProblemsState.usePassiveState());
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const { addNotification } = useNotification();
  const isCompilingRef = useRef(false);
  const isRebuildingRef = useRef(false);
  const pendingCompileRef = useRef<PendingCompileRequest | null>(null);
  const handleCompileRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const lastCompileRequestRef = useRef(0);
  const lastSilentCompileRequestRef = useRef(0);

  const isSystemProcessingRef = useRef(isSystemProcessing);
  const isAIProcessingRef = useRef(isAIProcessing);
  useEffect(() => {
    isSystemProcessingRef.current = isSystemProcessing;
    isAIProcessingRef.current = isAIProcessing;
    if (!isSystemProcessing && !isAIProcessing && pendingCompileRef.current !== null) {
      if (pendingCompileRef.current.workspaceEpoch !== workspaceEpoch) {
        pendingCompileRef.current = null;
        return;
      }
      const hasFullCompileRequest = compileRequest !== lastCompileRequestRef.current;
      const hasSilentCompileRequest = silentCompileRequest !== lastSilentCompileRequestRef.current;
      const pendingCompile = pendingCompileRef.current.silent !== false && !hasFullCompileRequest;
      pendingCompileRef.current = null;
      if (hasFullCompileRequest) lastCompileRequestRef.current = compileRequest;
      if (hasSilentCompileRequest) {
        lastSilentCompileRequestRef.current = silentCompileRequest;
      }
      void handleCompileRef.current?.(pendingCompile);
    }
  }, [compileRequest, isAIProcessing, isSystemProcessing, silentCompileRequest, workspaceEpoch]);

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
      const queueCompile = () => {
        const pending = pendingCompileRef.current;
        pendingCompileRef.current =
          !pending || pending.workspaceEpoch !== workspaceEpoch
            ? { silent: isSilent, workspaceEpoch }
            : { silent: pending.silent && isSilent, workspaceEpoch };
      };
      if (isCompilingRef.current) {
        // Keep the most recent build request while a previous build is unwinding.
        // A full build takes priority over a queued silent rebuild.
        queueCompile();
        return;
      }
      if (isSystemProcessingRef.current || isAIProcessingRef.current) {
        queueCompile();
        return;
      }
      isCompilingRef.current = true;
      const compileWorkspaceEpoch = workspaceEpoch;
      const compileRootHandle = fs.rootHandle;
      const isCurrentWorkspace = () =>
        (appState.workspaceEpoch || 0) === compileWorkspaceEpoch &&
        currentRootHandleRef.current === compileRootHandle;
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
        if (logQueue.length === 0 || !isCurrentWorkspace()) return;
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
        if (!isCurrentWorkspace()) return;
        logQueue.push(text);
        if (!logTimer) {
          logTimer = setTimeout(() => {
            flushLogs();
            logTimer = null;
          }, 100);
        }
      };

      const onPhase = (phase: string) => {
        if (!isCurrentWorkspace()) return;
        previewState((draft) => {
          draft.compilePhase = PHASE_LABELS[phase] || phase;
        });
      };

      try {
        const { Compiler } = await loadCompiler();
        if (!isCurrentWorkspace()) return;
        previewState((draft) => {
          draft.containerStatus = 'initializing';
        });
        const compiler = new Compiler(onLog, onPhase);
        const deletedPaths = Object.keys(editorState.pendingDeletions || {});
        const overlayPaths = [
          ...new Set([
            ...Object.keys(editorState.pendingDiffs || {}),
            ...Object.keys(editorState.dirtyBufferContents || {}),
          ]),
        ];
        const localFs = toCompilerFs(fs, deletedPaths, overlayPaths);
        // Build/Preview compile proposed editor buffers, including unapproved AI diffs.
        await compiler.compile(
          localFs,
          folderTree,
          createEffectivePreviewFileContentsSnapshot(editorState),
        );
        if (!isCurrentWorkspace()) return;
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
        if (!isCurrentWorkspace()) return;
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
        isSystemProcessingRef.current = false;
        isCompilingRef.current = false;
        const pendingCompile = pendingCompileRef.current;
        if (pendingCompile !== null) {
          pendingCompileRef.current = null;
          if (pendingCompile.workspaceEpoch === (appState.workspaceEpoch || 0)) {
            queueMicrotask(() => {
              void handleCompileRef.current?.(pendingCompile.silent);
            });
          }
        }
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
      appState,
      workspaceEpoch,
    ],
  );

  handleCompileRef.current = handleCompile;

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
    const requestWorkspaceEpoch = workspaceEpoch;
    const requestRootHandle = fs.rootHandle;
    const isCurrentWorkspace = () =>
      (appState.workspaceEpoch || 0) === requestWorkspaceEpoch &&
      currentRootHandleRef.current === requestRootHandle;
    try {
      const { Compiler } = await loadCompiler();
      if (!isCurrentWorkspace()) return;
      await Compiler.reset();
      if (!isCurrentWorkspace()) return;
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
      if (!isCurrentWorkspace()) return;
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
  }, [
    appState,
    fs.rootHandle,
    workspaceEpoch,
    previewState,
    logState,
    handleOpenLog,
    addNotification,
  ]);

  const handleRebuild = useCallback(async () => {
    if (
      isSystemProcessingRef.current ||
      isAIProcessingRef.current ||
      isCompilingRef.current ||
      isRebuildingRef.current
    ) {
      return;
    }
    isRebuildingRef.current = true;
    const requestWorkspaceEpoch = workspaceEpoch;
    const requestRootHandle = fs.rootHandle;
    const isCurrentWorkspace = () =>
      (appState.workspaceEpoch || 0) === requestWorkspaceEpoch &&
      currentRootHandleRef.current === requestRootHandle;

    try {
      const { Compiler } = await loadCompiler();
      if (!isCurrentWorkspace()) return;
      await Compiler.reset();
      if (!isCurrentWorkspace()) return;
      previewState((draft) => {
        draft.isCompilerReady = false;
      });
      await handleCompile();
    } catch (err) {
      if (!isCurrentWorkspace()) return;
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
  }, [
    appState,
    fs.rootHandle,
    workspaceEpoch,
    handleCompile,
    previewState,
    logState,
    handleOpenLog,
    addNotification,
  ]);

  return {
    handleCompile,
    handleRebuild,
    handleOpenLog,
    handleOpenPreview,
    handleClearFS,
  };
}
