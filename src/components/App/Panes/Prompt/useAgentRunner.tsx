import { applyAgentChanges } from '@/components/AI/Agent';
import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import type { AgentEvent } from '@/components/AI/types';
import { AppState } from '@/components/App/AppState';
import { ChangeSetState, getWorkspaceIndex } from '@/components/Workspace';
import type { FormEvent } from 'react';
import { useCallback } from 'react';
import { requireStore, toCompilerFs } from '../../types';
import { MAX_REASONING_EVENTS, formatSessionContext } from './AgentSessions';
import type { AgentEventFormatter, UseAgentRunnerParams } from './prompt-types';

const ROLE_LABELS: Record<string, string> = {
  planner: 'Planner',
  coder: 'Coder',
  reviewer: 'Reviewer',
};

export const formatAgentEvent: AgentEventFormatter = (event, roleLabelById = {}) => {
  const roleKey = event.agentRole ?? '';
  const roleName = roleLabelById[roleKey] || ROLE_LABELS[roleKey] || event.agentRole || null;
  const rolePrefix = roleName ? `**${roleName}** · ` : '';
  if (event.type === 'thinking') {
    return `${rolePrefix}**Step ${event.turn}:** ${event.message || 'planning next action…'}`;
  }
  if (event.type === 'tool') {
    const action = event.action;
    const actionObj = typeof action === 'object' && action ? action : null;
    const target = actionObj?.path || actionObj?.query || '';
    const actionName = actionObj?.action || (typeof action === 'string' ? action : '');
    return `${rolePrefix}**Step ${event.turn}:** \`${actionName}\`${target ? ` — ${target}` : ''}`;
  }
  if (event.type === 'observation') {
    const action = typeof event.action === 'string' ? event.action : event.action?.action;
    const prefix = action ? `\`${action}\` ${event.error ? 'failed' : 'completed'}` : '';
    const detail = event.message ? `${prefix ? ' — ' : ''}${event.message}` : '';
    return event.error
      ? `⚠ ${rolePrefix}${prefix}${detail}`
      : `${rolePrefix}**Step ${event.turn} result:** ${prefix}${detail}`;
  }
  if (event.type === 'finished') {
    return `${rolePrefix}**Ready for review:** ${event.message || 'Agent finished.'}`;
  }
  return '';
};

export default function useAgentRunner({
  val,
  isAIProcessing,
  activeSession,
  agentSessionState,
  promptUiState,
  promptScope,
  selectedModel,
  abortController,
  runningSessionId,
  addToHistory,
  patchSession,
  pushSessionMessage,
  createSessionMessage,
  fs,
  tabState,
  editorState,
  sidebarState,
  logState,
}: UseAgentRunnerParams) {
  const changeSetState = requireStore(ChangeSetState.usePassiveState());
  const appState = requireStore(AppState.usePassiveState());
  const handleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      abortController?.abort();
      import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => {
        interruptWebLLM();
      });
      const sessionId = runningSessionId || agentSessionState?.activeSessionId;
      if (sessionId) {
        patchSession(sessionId, { status: 'idle', reasoning: '', reasoningEvents: [] });
        pushSessionMessage(
          sessionId,
          createSessionMessage({ role: 'system', text: 'AI generation stopped by user.' }),
        );
      }
      promptUiState((draft) => {
        draft.runningSessionId = null;
        draft.abortController = null;
      });
      logState((draft) => {
        draft.isAIProcessing = false;
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'system',
            text: 'AI generation stopped by user.',
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });
    },
    [
      abortController,
      agentSessionState,
      createSessionMessage,
      logState,
      patchSession,
      promptUiState,
      pushSessionMessage,
      runningSessionId,
    ],
  );

  const send = useCallback(
    (e: FormEvent | null = null, request: string | null = null, scope: string | null = null) => {
      e?.preventDefault?.();
      const userMsg = typeof request === 'string' ? request : val;
      const effectiveScope = scope || promptScope;
      if (!userMsg.trim() || isAIProcessing || !activeSession) return;

      const sessionId = activeSession.id;
      const sessionMode = activeSession.mode === 'team' ? 'team' : 'single';
      addToHistory(userMsg);

      const currentActiveTabId = tabState.activeTabId;
      const currentActiveTab = tabState.openTabs.find((t) => t.id === currentActiveTabId);
      const autoApproveInitialProject =
        activeSession.messages.length === 0 &&
        Object.keys(editorState.fileContents || {}).length === 0 &&
        (sidebarState.folderTree || []).length === 0;

      pushSessionMessage(sessionId, createSessionMessage({ role: 'user', text: userMsg }));
      patchSession(sessionId, { status: 'running', reasoning: '', reasoningEvents: [] });
      promptUiState((draft) => {
        draft.val = '';
        draft.draftVal = '';
        draft.historyIndex = -1;
        draft.runningSessionId = sessionId;
      });

      logState((draft) => {
        draft.isAIProcessing = true;
        draft.reasoning = '';
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'system',
            text: `[${activeSession.name}] started (${sessionMode}).`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });

      const runAI = async () => {
        const liveChanges = new Map<string, { path: string; before?: string; after?: string }>();
        const mergeWithLiveChanges = (changes: import('@/components/AI/types').AgentChange[]) => {
          const merged = new Map(liveChanges);
          for (const change of changes) {
            const path = change.path || change.filePath;
            if (path) merged.set(path, { ...change, path });
          }
          return [...merged.values()];
        };
        try {
          console.info('[Prompt] Starting AI request for:', userMsg);
          const selectedLines =
            (currentActiveTabId && editorState.selectedLines?.[currentActiveTabId]) || [];
          const controller = new AbortController();
          promptUiState((draft) => {
            draft.abortController = controller;
          });
          const events: Array<{ text: string; timestamp: string }> = [];
          let progressEventIndex: number | null = null;
          const appendReasoning = (line: string, replaceProgress = false) => {
            const event = { text: line, timestamp: new Date().toTimeString().split(' ')[0] };
            if (replaceProgress && progressEventIndex !== null) {
              events[progressEventIndex] = event;
            } else {
              events.push(event);
              progressEventIndex = replaceProgress ? events.length - 1 : null;
            }
            const reasoningEvents = events.slice(-MAX_REASONING_EVENTS);
            const reasoning = reasoningEvents.map((event) => event.text).join('\n\n');
            patchSession(sessionId, { reasoning, reasoningEvents });
            logState((draft) => {
              (draft as typeof draft & { reasoning?: string }).reasoning = reasoning;
            });
          };
          appendReasoning('**Preparing workspace:** collecting project files for the local agent…');
          const priorContext = formatSessionContext(activeSession.messages || []);
          const roleGraph = activeSession.roleGraph as {
            roles?: Array<{ id: string; label?: string; kind?: string }>;
          } | null;
          const roleLabelById = Object.fromEntries(
            (roleGraph?.roles || []).map((role) => [role.id, role.label || role.kind || role.id]),
          );
          const [
            {
              collectWorkspaceFiles,
              runAgent,
              runCollaborativeAgent,
              applyAgentChanges,
              ensureFileInTree,
              removeFileFromTree,
            },
            { Compiler },
          ] = await Promise.all([import('@/components/AI/Agent'), import('@/utils/compiler')]);
          const workspaceFiles = await collectWorkspaceFiles(
            toCompilerFs(fs) as never,
            editorState.fileContents || {},
          );
          appendReasoning(
            `**Workspace ready:** ${Object.keys(workspaceFiles).length} file(s) available. Loading **${selectedModel}** and starting the agent…`,
          );
          // Tool events may arrive before a run completes. The live-write ledger
          // declared above keeps those visible drafts inside the eventual review set.
          const runOptions = {
            request: userMsg,
            priorContext,
            scope: (effectiveScope === 'project' ? 'project' : 'file') as 'file' | 'project',
            activeFile:
              effectiveScope === 'file' && currentActiveTab?.type === 'file'
                ? currentActiveTabId
                : undefined,
            selectedLines: effectiveScope === 'file' ? selectedLines : [],
            files: workspaceFiles,
            model: selectedModel,
            roleGraph: activeSession.roleGraph as import('@/components/AI/types').RoleGraph | null,
            signal: controller.signal,
            retrieveContext: async (query: string, k: number) => {
              const lexical = (await getWorkspaceIndex()
                .queryText(query, k)
                .catch(() => [])) as Array<{ path: string; preview?: string; score?: number }>;
              return lexical.map((item) => ({
                filePath: item.path,
                content: item.preview || '',
                score: item.score || 0,
                linkedCss: [],
              }));
            },
            workspaceIndex: getWorkspaceIndex(),
            validate: async (stagedFiles: Record<string, string>) => {
              const validationLogs: string[] = [];
              const compiler = new Compiler((line: string) => validationLogs.push(line));
              try {
                await compiler.compile(
                  toCompilerFs(fs),
                  sidebarState.folderTree || [],
                  stagedFiles,
                );
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
            runProjectCheck: async (check: string, stagedFiles: Record<string, string>) => {
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
            inspectPreview: async (stagedFiles: Record<string, string>) => {
              const verificationLogs: string[] = [];
              const compiler = new Compiler((line: string) => verificationLogs.push(line));
              try {
                await compiler.compile(
                  toCompilerFs(fs),
                  sidebarState.folderTree || [],
                  stagedFiles,
                );
                const { getLatestPreviewEvidence } = await import(
                  '@/components/App/Views/PreviewArea/previewEvidenceBridge'
                );
                const { summarizeVisualPreviewEvidence } = await import(
                  '@/components/AI/Agent/VisualPreviewEvidence'
                );
                const evidence = getLatestPreviewEvidence();
                const runtimeErrors: string[] = [];
                return {
                  status: 'passed',
                  path: evidence?.path || '/preview/',
                  title: evidence?.title || 'Preview ready',
                  domSummary:
                    evidence?.text || 'Open the Preview pane to collect rendered DOM evidence.',
                  elements: evidence?.elements || [],
                  runtimeErrors,
                  visualEvidence: summarizeVisualPreviewEvidence(evidence, runtimeErrors),
                  screenshotCaptured: Boolean(evidence?.screenshotCaptured),
                  diagnostics: verificationLogs.slice(-12).join('\n'),
                };
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                  status: 'failed',
                  runtimeErrors: [message],
                  screenshotCaptured: false,
                  diagnostics: verificationLogs.slice(-20).join('\n'),
                };
              }
            },
            onEvent: (event: AgentEvent) => {
              const line = formatAgentEvent(event, roleLabelById);
              if (line) appendReasoning(line, event.replaceProgress);

              if (event.type === 'tool' && event.action && typeof event.action === 'object') {
                const actionObj = event.action;
                if (actionObj.action === 'write_file' && actionObj.path) {
                  const filePath = actionObj.path;
                  ensureFileInTree(sidebarState, filePath);
                  const content = actionObj.content || '';
                  let originalContent = '';
                  editorState((draft) => {
                    const existing = draft.pendingDiffs?.[filePath];
                    originalContent =
                      existing?.originalContent ?? draft.fileContents?.[filePath] ?? '';
                    const pendingDiffs = { ...(draft.pendingDiffs || {}) };
                    pendingDiffs[filePath] = {
                      originalContent,
                      modifiedContent: content,
                      originalCursorPos: existing?.originalCursorPos,
                      diffs: computeDiff(originalContent, content).diffs,
                    };
                    draft.fileContents = { ...(draft.fileContents || {}), [filePath]: content };
                    draft.pendingDiffs = pendingDiffs;
                  });
                  liveChanges.set(filePath, {
                    path: filePath,
                    before: originalContent,
                    after: content,
                  });
                  appendReasoning(
                    `**Live draft available:** \`${filePath}\` can now be opened from the file tree.`,
                  );
                } else if (actionObj.action === 'delete_file' && actionObj.path) {
                  liveChanges.set(actionObj.path, {
                    path: actionObj.path,
                    before: editorState.fileContents?.[actionObj.path],
                    after: undefined,
                  });
                  removeFileFromTree(sidebarState, actionObj.path);
                }
              }
            },
          };

          const result =
            sessionMode === 'team'
              ? await runCollaborativeAgent(
                  runOptions as import('@/components/AI/types').RunCollaborativeAgentOptions,
                )
              : await runAgent(runOptions as import('@/components/AI/types').RunAgentOptions);
          appendReasoning('**Agent complete:** preparing validated changes for the workspace…');

          let stillProcessing = false;
          logState((draft) => {
            stillProcessing = draft.isAIProcessing;
          });
          if (!stillProcessing) return;

          const summaryText = `[Local agent${sessionMode === 'team' ? ' team' : ''}]: ${
            result.summary || `Prepared ${result.changes.length} file(s) for review.`
          }`;
          pushSessionMessage(
            sessionId,
            createSessionMessage({
              role: 'ai',
              text: summaryText,
              agentRole: sessionMode === 'team' ? 'reviewer' : null,
            }),
          );
          patchSession(sessionId, { status: 'idle' });
          promptUiState((draft) => {
            draft.runningSessionId = null;
            draft.abortController = null;
          });
          logState((draft) => {
            draft.logs = [
              ...draft.logs,
              {
                id: Date.now() + 1,
                role: 'ai',
                text: summaryText,
                timestamp: new Date().toTimeString().split(' ')[0],
              },
            ];
            draft.isAIProcessing = false;
          });

          const { applied, deletions, changeSet } = applyAgentChanges(
            mergeWithLiveChanges(result.changes),
            {
              editorState: editorState as never,
              sidebarState: sidebarState as never,
              logState: logState as never,
              changeSetState: changeSetState as never,
              request: userMsg,
              autoApprove: autoApproveInitialProject,
            },
          );
          if (autoApproveInitialProject && applied > 0) {
            appendReasoning(
              '**Initial project ready:** starting the first build now. Preview will open automatically when it succeeds…',
            );
            appState((draft) => {
              draft.compileRequest = (draft.compileRequest || 0) + 1;
            });
          }
          if (changeSet) {
            pushSessionMessage(
              sessionId,
              createSessionMessage({
                role: 'system',
                text: `Change set ${changeSet.id} is ready for explicit review.`,
              }),
            );
          }
          if (deletions.length > 0) {
            editorState((draft) => {
              const next = { ...(draft.pendingDeletions || {}) };
              for (const { path, before } of deletions) {
                next[path] = { originalContent: before, changeSetId: changeSet?.id ?? '' };
              }
              draft.pendingDeletions = next;
            });
            const deletionText = `Deletion review pending for ${deletions.map(({ path }) => path).join(', ')}. Approve or undo in the editor.`;
            pushSessionMessage(
              sessionId,
              createSessionMessage({ role: 'system', text: deletionText }),
            );
            logState((draft) => {
              draft.logs = [
                ...draft.logs,
                {
                  id: Date.now() + 6,
                  role: 'system',
                  text: deletionText,
                  timestamp: new Date().toTimeString().split(' ')[0],
                },
              ];
            });
          }
        } catch (err) {
          const message = `Agent error: ${err instanceof Error ? err.message : String(err)}`;
          const errChanges =
            err &&
            typeof err === 'object' &&
            'changes' in err &&
            Array.isArray((err as { changes?: unknown }).changes)
              ? (err as { changes: import('@/components/AI/types').AgentChange[] }).changes
              : [];
          const reviewableChanges = mergeWithLiveChanges(errChanges);

          if (reviewableChanges.length > 0) {
            applyAgentChanges(reviewableChanges, {
              editorState: editorState as never,
              sidebarState: sidebarState as never,
              logState: logState as never,
              changeSetState: changeSetState as never,
              request: userMsg,
              autoApprove: autoApproveInitialProject,
            });
          }

          logState((draft) => {
            if (!draft.isAIProcessing) return;
            draft.logs = [
              ...draft.logs,
              {
                id: Date.now(),
                role: 'ai',
                text: message,
                timestamp: new Date().toTimeString().split(' ')[0],
              },
            ];
            draft.isAIProcessing = false;
          });
          pushSessionMessage(sessionId, createSessionMessage({ role: 'ai', text: message }));
          patchSession(sessionId, { status: 'error' });
          promptUiState((draft) => {
            draft.runningSessionId = null;
            draft.abortController = null;
          });
        }
      };

      runAI();
    },
    [
      activeSession,
      addToHistory,
      appState,
      createSessionMessage,
      changeSetState,
      editorState,
      fs,
      isAIProcessing,
      logState,
      patchSession,
      promptScope,
      promptUiState,
      pushSessionMessage,
      selectedModel,
      sidebarState,
      tabState,
      val,
    ],
  );

  return { send, handleStop };
}
