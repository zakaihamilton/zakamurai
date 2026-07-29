import type { AgentEvent } from '@/components/AI/types';
import { ChangeSetState, getWorkspaceIndex } from '@/components/Workspace';
import type { FormEvent } from 'react';
import { useCallback } from 'react';
import { requireStore, toCompilerFs } from '../../types';
import { formatSessionContext } from './AgentSessions';
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
    return `${rolePrefix}**Step ${event.turn}:** planning next action…`;
  }
  if (event.type === 'tool') {
    const action = event.action;
    const actionObj = typeof action === 'object' && action ? action : null;
    const target = actionObj?.path || actionObj?.query || '';
    const actionName = actionObj?.action || (typeof action === 'string' ? action : '');
    return `${rolePrefix}**Step ${event.turn}:** \`${actionName}\`${target ? ` — ${target}` : ''}`;
  }
  if (event.type === 'observation') {
    return event.error ? `⚠ ${event.message}` : `${rolePrefix}${event.message}`;
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
  const handleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      abortController?.abort();
      import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => {
        interruptWebLLM();
      });
      const sessionId = runningSessionId || agentSessionState?.activeSessionId;
      if (sessionId) {
        patchSession(sessionId, { status: 'idle', reasoning: '' });
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

      pushSessionMessage(sessionId, createSessionMessage({ role: 'user', text: userMsg }));
      patchSession(sessionId, { status: 'running', reasoning: '' });
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
        try {
          console.info('[Prompt] Starting AI request for:', userMsg);
          const selectedLines =
            (currentActiveTabId && editorState.selectedLines?.[currentActiveTabId]) || [];
          const controller = new AbortController();
          promptUiState((draft) => {
            draft.abortController = controller;
          });
          const events: string[] = [];
          const priorContext = formatSessionContext(activeSession.messages || []);
          const roleGraph = activeSession.roleGraph as {
            roles?: Array<{ id: string; label?: string; kind?: string }>;
          } | null;
          const roleLabelById = Object.fromEntries(
            (roleGraph?.roles || []).map((role) => [role.id, role.label || role.kind || role.id]),
          );
          const [
            { collectWorkspaceFiles, runAgent, runCollaborativeAgent, applyAgentChanges },
            { Compiler },
          ] = await Promise.all([import('@/components/AI/Agent'), import('@/utils/compiler')]);
          const workspaceFiles = await collectWorkspaceFiles(
            toCompilerFs(fs) as never,
            editorState.fileContents || {},
          );
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
                const evidence = getLatestPreviewEvidence();
                return {
                  status: 'passed',
                  path: evidence?.path || '/preview/',
                  title: evidence?.title || 'Preview ready',
                  domSummary:
                    evidence?.text || 'Open the Preview pane to collect rendered DOM evidence.',
                  elements: evidence?.elements || [],
                  runtimeErrors: [],
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
              if (line) events.push(line);
              const reasoning = events.slice(-30).join('\n\n');
              patchSession(sessionId, { reasoning });
              logState((draft) => {
                (draft as typeof draft & { reasoning?: string }).reasoning = reasoning;
              });
            },
          };

          const result =
            sessionMode === 'team'
              ? await runCollaborativeAgent(
                  runOptions as import('@/components/AI/types').RunCollaborativeAgentOptions,
                )
              : await runAgent(runOptions as import('@/components/AI/types').RunAgentOptions);

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

          const { deletions, changeSet } = applyAgentChanges(result.changes, {
            editorState: editorState as never,
            sidebarState: sidebarState as never,
            logState: logState as never,
            changeSetState: changeSetState as never,
            request: userMsg,
          });
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
