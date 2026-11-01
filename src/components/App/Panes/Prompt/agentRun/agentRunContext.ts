import type { FileMap, RunManagerOptions } from '@/components/AI/types';
import {
  createEffectiveFileContentsSnapshot,
  createEffectivePreviewFileContentsSnapshot,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { FileSystemApi } from '@/components/App/types';
import Settings from '@/components/Storage/Settings';
import { analyzeProjectHealth } from '@/contracts/project';
import { createWorkspaceSnapshot } from '@/contracts/workspace';
import type {
  AppStateShape,
  PreviewStateShape,
  SidebarStateShape,
  TabStateShape,
} from '@/types/domain-types';
import type { RagWorkspaceFilterOptions } from '@/utils/rag/rag-files';
import { selectRagWorkspaceFiles } from '@/utils/rag/rag-files';
import type { StateStore } from 'triactor';
import { toCompilerFs } from '../../../types';

export async function prepareAgentRunContext({
  fs,
  editorState,
  tabState,
  appState,
  appendReasoning,
}: {
  fs: FileSystemApi;
  editorState: StateStore<ExtendedEditorState>;
  tabState: StateStore<TabStateShape>;
  appState: StateStore<AppStateShape>;
  appendReasoning: (line: string) => void;
}) {
  const [{ collectWorkspaceFiles }, { Compiler }] = await Promise.all([
    import('@/components/AI/Agent/Snapshot'),
    import('@/utils/compiler'),
  ]);
  const fileContents = createEffectiveFileContentsSnapshot(editorState);
  const pendingDeletionPaths = Object.keys(editorState.pendingDeletions || {});
  const overlayPaths = [
    ...new Set([
      ...Object.keys(editorState.pendingDiffs || {}),
      ...Object.keys(editorState.dirtyBufferContents || {}),
    ]),
  ];
  const workspaceFiles = await collectWorkspaceFiles(
    toCompilerFs(fs, pendingDeletionPaths, overlayPaths) as never,
    createEffectivePreviewFileContentsSnapshot(editorState),
  );
  const projectHealth = analyzeProjectHealth(workspaceFiles);
  const preflightSummary = projectHealth.items.length
    ? projectHealth.items
        .map((item) => `${item.severity.toUpperCase()}: ${item.message}`)
        .join('\n')
    : 'No project preflight issues detected.';

  appendReasoning(
    `**Workspace ready:** ${Object.keys(workspaceFiles).length} file(s) available. The manager will use tools directly where possible.`,
  );
  appendReasoning(`**Project preflight (${projectHealth.status}):**\n${preflightSummary}`);

  const checkpoint = createWorkspaceSnapshot({
    reason: 'ai-change',
    projectName: appState.projectName,
    fileContents,
    pendingDiffs: { ...(editorState.pendingDiffs || {}) },
    pendingDeletions: { ...(editorState.pendingDeletions || {}) },
    openTabs: [...(tabState.openTabs || [])],
    activeTabId: tabState.activeTabId || null,
  });
  const checkpointSaved = await Settings.saveRecoveryCheckpoint(checkpoint);
  appendReasoning(
    checkpointSaved
      ? '**Checkpoint:** saved before AI changes are staged.'
      : '**Checkpoint:** could not be saved; continuing without a durable pre-change restore point.',
  );

  const workspaceNames = Object.keys(workspaceFiles).slice(0, 80);
  if (workspaceNames.length) {
    appendReasoning(`**Workspace files:** ${workspaceNames.map(quoteDetail).join(', ')}`);
  }

  return { Compiler, workspaceFiles, preflightSummary };
}

const quoteDetail = (value: string): string => `\`${value.replaceAll('`', '\\`')}\``;

export function createManagerToolOptions({
  Compiler,
  fs,
  baselineFiles = {},
  baselineDeletedPaths = [],
  baselineOverlayPaths = [],
  sidebarState,
  tabState,
  previewState,
  isWorkspaceCurrent = () => true,
  onPreviewInspection,
  workspaceProfile,
}: {
  Compiler: typeof import('@/utils/compiler').Compiler;
  fs: FileSystemApi;
  baselineFiles?: FileMap;
  baselineDeletedPaths?: string[];
  baselineOverlayPaths?: string[];
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  previewState?: StateStore<PreviewStateShape>;
  isWorkspaceCurrent?: () => boolean;
  onPreviewInspection?: (files: FileMap, result: unknown) => void;
  workspaceProfile?: RagWorkspaceFilterOptions;
}): Pick<
  RunManagerOptions,
  'validate' | 'runProjectCheck' | 'inspectPreview' | 'retrieveContext' | 'onPreviewInspection'
> {
  const compilerFsFor = (stagedFiles: FileMap) => {
    const overlayPaths = new Set(baselineOverlayPaths);
    for (const [path, content] of Object.entries(stagedFiles)) {
      if (!Object.hasOwn(baselineFiles, path) || baselineFiles[path] !== content) {
        overlayPaths.add(path);
      }
    }
    return toCompilerFs(
      fs,
      [
        ...new Set([
          ...baselineDeletedPaths.filter((path) => !Object.hasOwn(stagedFiles, path)),
          ...Object.keys(baselineFiles).filter((path) => !Object.hasOwn(stagedFiles, path)),
        ]),
      ],
      [...overlayPaths],
    );
  };
  return {
    onPreviewInspection,
    retrieveContext: async (query, k) => {
      if (!isWorkspaceCurrent() || !query.trim()) return [];
      const { ragSearch } = await import('@/utils/rag/search-utility');
      const indexableFiles = selectRagWorkspaceFiles(baselineFiles, workspaceProfile);
      const results = await ragSearch.retrieveContext(query, k, indexableFiles);
      if (!isWorkspaceCurrent()) return [];
      return results.filter((item) => Object.hasOwn(indexableFiles, item.filePath));
    },
    validate: async (stagedFiles: FileMap) => {
      if (!isWorkspaceCurrent()) {
        return {
          status: 'failed',
          check: 'build',
          diagnostics: 'Workspace changed during this run.',
        };
      }
      const validationLogs: string[] = [];
      const compiler = new Compiler((line: string) => validationLogs.push(line));
      try {
        await compiler.compile(
          compilerFsFor(stagedFiles),
          sidebarState.folderTree || [],
          stagedFiles,
        );
        if (!isWorkspaceCurrent()) {
          return {
            status: 'failed',
            check: 'build',
            diagnostics: 'Workspace changed during this run.',
          };
        }
        return {
          status: 'passed',
          check: 'build',
          diagnostics: validationLogs.slice(-12).join('\n'),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: 'failed',
          check: 'build',
          diagnostics: `${message}\n${validationLogs.slice(-20).join('\n')}`,
        };
      }
    },
    runProjectCheck: async (check, stagedFiles) => {
      if (!isWorkspaceCurrent()) return 'Workspace changed during this run.';
      const logs: string[] = [];
      const compiler = new Compiler((line: string) => logs.push(line));
      const output = await compiler.runProjectCheck(
        compilerFsFor(stagedFiles),
        sidebarState.folderTree || [],
        stagedFiles,
        check,
      );
      if (!isWorkspaceCurrent()) return 'Workspace changed during this run.';
      return [output, ...logs.slice(-12)].filter(Boolean).join('\n');
    },
    inspectPreview: async (stagedFiles: FileMap) => {
      if (!isWorkspaceCurrent()) {
        return { status: 'unavailable', diagnostics: 'Workspace changed during this run.' };
      }
      const logs: string[] = [];
      const reportPreviewInspection = (result: unknown) => {
        if (!isWorkspaceCurrent()) return;
        onPreviewInspection?.({ ...stagedFiles }, result);
      };
      const compiler = new Compiler((line: string) => logs.push(line));
      const evidenceBridge = await import(
        '@/components/App/Views/PreviewArea/previewEvidenceBridge'
      );
      const evidenceRevision = previewState ? evidenceBridge.clearPreviewEvidence() : 0;
      try {
        await compiler.compile(
          compilerFsFor(stagedFiles),
          sidebarState.folderTree || [],
          stagedFiles,
        );
        if (!isWorkspaceCurrent()) {
          return { status: 'unavailable', diagnostics: 'Workspace changed during this run.' };
        }
        let evidence = evidenceBridge.getLatestPreviewEvidence();
        if (previewState) {
          const container = compiler.container;
          if (!container?.vfs?.existsSync('/dist/index.html')) {
            throw new Error('Compiled preview did not produce /dist/index.html.');
          }
          const html = container.vfs.readFileSync('/dist/index.html', 'utf8');
          if (!html) throw new Error('Compiled preview produced an empty HTML entrypoint.');
          container.vfs.writeFileSync('/index.html', html);
          tabState((draft) => {
            const exists = draft.openTabs.some((tab) => tab.id === 'preview');
            if (!exists) {
              draft.openTabs = [
                ...draft.openTabs,
                { id: 'preview', type: 'preview', label: 'Preview' },
              ];
            }
          });
          previewState((draft) => {
            draft.htmlContent = `${html}\n<!-- zakamurai-ai-preview:${Date.now()} -->`;
            draft.previewAddress = '/preview/dist/index.html';
            draft.restoreError = null;
            draft.compileError = null;
            draft.serverError = null;
            draft.isCompilerReady = true;
          });
          evidence = await evidenceBridge.waitForPreviewEvidence(evidenceRevision);
          if (!isWorkspaceCurrent()) {
            return { status: 'unavailable', diagnostics: 'Workspace changed during this run.' };
          }
          if (!evidence) {
            const result = {
              status: 'unavailable',
              path: '/preview/dist/index.html',
              screenshotCaptured: false,
              diagnostics: `Preview did not emit fresh evidence for the staged build. ${logs.slice(-12).join('\n')}`,
            };
            reportPreviewInspection(result);
            return result;
          }
        }
        const result = {
          status: 'passed',
          path: evidence?.path || '/preview/',
          title: evidence?.title || 'Preview ready',
          domSummary: evidence?.text || 'Preview evidence is available.',
          elements: evidence?.elements || [],
          runtimeErrors: evidence?.runtimeErrors || [],
          styleAudit: evidence?.styleAudit,
          screenshotCaptured: Boolean(evidence?.screenshotCaptured),
          diagnostics: logs.slice(-12).join('\n'),
        };
        reportPreviewInspection(result);
        return result;
      } catch (error) {
        const result = {
          status: 'failed',
          runtimeErrors: [error instanceof Error ? error.message : String(error)],
          screenshotCaptured: false,
          diagnostics: logs.slice(-20).join('\n'),
        };
        reportPreviewInspection(result);
        return result;
      }
    },
  };
}
