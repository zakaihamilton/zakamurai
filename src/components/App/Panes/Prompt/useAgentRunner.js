import { useCallback } from 'react';

const ROLE_LABELS = {
  planner: 'Planner',
  coder: 'Coder',
  reviewer: 'Reviewer',
};

export function formatAgentEvent(event, roleLabelById = {}) {
  const roleName =
    roleLabelById[event.agentRole] || ROLE_LABELS[event.agentRole] || event.agentRole || null;
  const rolePrefix = roleName ? `**${roleName}** · ` : '';
  if (event.type === 'thinking') {
    return `${rolePrefix}**Step ${event.turn}:** planning next action…`;
  }
  if (event.type === 'tool') {
    const target = event.action.path || event.action.query || '';
    return `${rolePrefix}**Step ${event.turn}:** \`${event.action.action}\`${target ? ` — ${target}` : ''}`;
  }
  if (event.type === 'observation') {
    return event.error ? `⚠ ${event.message}` : `${rolePrefix}${event.message}`;
  }
  if (event.type === 'finished') {
    return `${rolePrefix}**Ready for review:** ${event.message || 'Agent finished.'}`;
  }
  return '';
}

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
}) {
  const handleStop = useCallback(
    (e) => {
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
        draft.reasoning = '';
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
    (e) => {
      e.preventDefault();
      if (!val.trim() || isAIProcessing || !activeSession) return;

      const userMsg = val;
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
          const selectedLines = editorState.selectedLines?.[currentActiveTabId] || [];
          const controller = new AbortController();
          promptUiState((draft) => {
            draft.abortController = controller;
          });
          const events = [];
          const roleLabelById = Object.fromEntries(
            (activeSession.roleGraph?.roles || []).map((role) => [
              role.id,
              role.label || role.kind,
            ]),
          );
          const [
            { collectWorkspaceFiles, runAgent, runCollaborativeAgent, applyAgentChanges },
            { Compiler },
          ] = await Promise.all([import('@/components/AI/Agent'), import('@/utils/compiler')]);
          const workspaceFiles = await collectWorkspaceFiles(fs, editorState.fileContents || {});
          const runOptions = {
            request: userMsg,
            scope: promptScope,
            activeFile:
              promptScope === 'file' && currentActiveTab?.type === 'file'
                ? currentActiveTabId
                : undefined,
            selectedLines: promptScope === 'file' ? selectedLines : [],
            files: workspaceFiles,
            model: selectedModel,
            roleGraph: activeSession.roleGraph,
            signal: controller.signal,
            retrieveContext: async (query, k) => {
              const { ragSearch } = await import('@/utils/rag/search-utility');
              return ragSearch.retrieveContext(query, k);
            },
            validate: async (stagedFiles) => {
              const validationLogs = [];
              const compiler = new Compiler((line) => validationLogs.push(line));
              try {
                await compiler.compile(fs, sidebarState.folderTree || [], stagedFiles);
                return {
                  status: 'passed',
                  check: 'build',
                  diagnostics: validationLogs.slice(-12).join('\n'),
                };
              } catch (error) {
                return {
                  status: 'failed',
                  check: 'build',
                  diagnostics: `${error.message}\n${validationLogs.slice(-20).join('\n')}`,
                };
              }
            },
            runProjectCheck: async (check, stagedFiles) => {
              const logs = [];
              const compiler = new Compiler((line) => logs.push(line));
              const output = await compiler.runProjectCheck(
                fs,
                sidebarState.folderTree || [],
                stagedFiles,
                check,
              );
              return [output, ...logs.slice(-12)].filter(Boolean).join('\n');
            },
            inspectPreview: async (stagedFiles) => {
              const verificationLogs = [];
              const compiler = new Compiler((line) => verificationLogs.push(line));
              try {
                await compiler.compile(fs, sidebarState.folderTree || [], stagedFiles);
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
                return {
                  status: 'failed',
                  runtimeErrors: [error.message],
                  screenshotCaptured: false,
                  diagnostics: verificationLogs.slice(-20).join('\n'),
                };
              }
            },
            onEvent: (event) => {
              const line = formatAgentEvent(event, roleLabelById);
              if (line) events.push(line);
              const reasoning = events.slice(-30).join('\n\n');
              patchSession(sessionId, { reasoning });
              logState((draft) => {
                draft.reasoning = reasoning;
              });
            },
          };

          const result =
            sessionMode === 'team'
              ? await runCollaborativeAgent(runOptions)
              : await runAgent(runOptions);

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

          const { deletions } = applyAgentChanges(result.changes, {
            editorState,
            sidebarState,
            logState,
          });
          if (deletions.length > 0) {
            editorState((draft) => {
              const next = { ...(draft.pendingDeletions || {}) };
              for (const { path, before } of deletions) {
                next[path] = { originalContent: before };
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
          const message = `Agent error: ${err.message || err}`;
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
