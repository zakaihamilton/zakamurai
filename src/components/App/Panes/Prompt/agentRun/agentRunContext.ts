import type { FileMap, RunManagerOptions } from '@/components/AI/types';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { FileSystemApi } from '@/components/App/types';
import Settings from '@/components/Storage/Settings';
import { getWorkspaceIndex } from '@/components/Workspace';
import { analyzeProjectHealth } from '@/contracts/project';
import { createWorkspaceSnapshot } from '@/contracts/workspace';
import type {
  AppStateShape,
  PreviewStateShape,
  SidebarStateShape,
  TabStateShape,
} from '@/types/domain-types';
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
  const workspaceFiles = await collectWorkspaceFiles(
    toCompilerFs(fs) as never,
    editorState.fileContents || {},
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
    fileContents: { ...(editorState.fileContents || {}) },
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
  sidebarState,
  tabState,
  previewState,
}: {
  Compiler: typeof import('@/utils/compiler').Compiler;
  fs: FileSystemApi;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  previewState?: StateStore<PreviewStateShape>;
}): Pick<RunManagerOptions, 'validate' | 'runProjectCheck' | 'inspectPreview' | 'retrieveContext'> {
  return {
    retrieveContext: async (query, k) => {
      const lexical = (await getWorkspaceIndex()
        .queryText(query, k)
        .catch(() => [])) as Array<{ path: string; preview?: string; score?: number }>;
      return lexical.map((item) => ({
        filePath: item.path,
        content: item.preview || '',
        score: item.score || 0,
      }));
    },
    validate: async (stagedFiles: FileMap) => {
      const validationLogs: string[] = [];
      const compiler = new Compiler((line: string) => validationLogs.push(line));
      try {
        await compiler.compile(toCompilerFs(fs), sidebarState.folderTree || [], stagedFiles);
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
      const logs: string[] = [];
      const compiler = new Compiler((line: string) => logs.push(line));
      const output = await compiler.runProjectCheck(
        toCompilerFs(fs),
        sidebarState.folderTree || [],
        stagedFiles,
        check,
      );
      return [output, ...logs.slice(-12)].filter(Boolean).join('\n');
    },
    inspectPreview: async (stagedFiles: FileMap) => {
      const logs: string[] = [];
      const compiler = new Compiler((line: string) => logs.push(line));
      const evidenceBridge = await import(
        '@/components/App/Views/PreviewArea/previewEvidenceBridge'
      );
      const evidenceRevision = previewState ? evidenceBridge.clearPreviewEvidence() : 0;
      try {
        await compiler.compile(toCompilerFs(fs), sidebarState.folderTree || [], stagedFiles);
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
            draft.activeTabId = 'preview';
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
          if (!evidence) {
            return {
              status: 'unavailable',
              path: '/preview/dist/index.html',
              screenshotCaptured: false,
              diagnostics: `Preview did not emit fresh evidence for the staged build. ${logs.slice(-12).join('\n')}`,
            };
          }
        }
        return {
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
      } catch (error) {
        return {
          status: 'failed',
          runtimeErrors: [error instanceof Error ? error.message : String(error)],
          screenshotCaptured: false,
          diagnostics: logs.slice(-20).join('\n'),
        };
      }
    },
  };
}
