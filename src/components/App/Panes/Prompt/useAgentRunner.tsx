import { applyAgentChanges } from '@/components/AI/Agent/Applier';
import { runManager } from '@/components/AI/Agent/ManagerRunner';
import type {
  ManagerEvent,
  RunManagerOptions,
  RunManagerResult,
  WebLLMGenerationMetrics,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import type { AgentChange, AgentEvent } from '@/components/AI/types';
import { AppState } from '@/components/App/AppState';
import Settings from '@/components/Storage/Settings';
import { ChangeSetState, getWorkspaceIndex } from '@/components/Workspace';
import type { AgentReasoningEntry } from '@/components/state/domain-types';
import { analyzeProjectHealth } from '@/contracts/project';
import { createWorkspaceSnapshot } from '@/contracts/workspace';
import type { FormEvent } from 'react';
import { useCallback } from 'react';
import { requireStore, toCompilerFs } from '../../types';
import { MAX_REASONING_EVENTS, clipReasoningStepIO, createAgentRunUsage } from './AgentSessions';
import type { AgentEventFormatter, UseAgentRunnerParams } from './prompt-types';

const quoteDetail = (value: string): string => `\`${value.replaceAll('`', '\\`')}\``;

const summarizeDetail = (value: string, maxCharacters = 240): string =>
  value.length > maxCharacters ? `${value.slice(0, maxCharacters)}…` : value;

export const formatAgentEvent: AgentEventFormatter = (event) => {
  const managerEvent = event as ManagerEvent;
  const legacy = event as AgentEvent;
  if ('agentRole' in legacy || 'action' in legacy) {
    const role = legacy.agentRole ? `**${legacy.agentRole}** · ` : '';
    if (legacy.type === 'thinking')
      return `${role}**Step ${legacy.turn}:** ${legacy.message || 'thinking…'}`;
    if (legacy.type === 'tool') {
      const action =
        typeof legacy.action === 'string' ? legacy.action : legacy.action?.action || '';
      return `${role}**Step ${legacy.turn}:** \`${action}\``;
    }
    if (legacy.type === 'observation') {
      const action =
        typeof legacy.action === 'string' ? legacy.action : legacy.action?.action || '';
      return `${role}\`${action}\` ${legacy.error ? 'failed' : 'completed'}${legacy.message ? ` — ${legacy.message}` : ''}`;
    }
    if (legacy.type === 'finished') {
      const paths = [
        ...new Set(
          (legacy.changes || [])
            .map((change) => change.path || change.filePath)
            .filter((path): path is string => Boolean(path)),
        ),
      ];
      return `${role}**Ready for review:** ${legacy.message || 'Agent finished.'}${
        paths.length
          ? `\n\n**Changed files (${paths.length}):** ${paths.map(quoteDetail).join(', ')}`
          : ''
      }`;
    }
  }
  if (managerEvent.type === 'routing') {
    return `**Routing:** ${managerEvent.message || 'The manager is classifying the request.'}`;
  }
  if (managerEvent.type === 'tool') {
    return `**Tool:** \`${managerEvent.tool || 'workspace'}\` — ${managerEvent.message || 'completed'}`;
  }
  if (managerEvent.type === 'context') {
    return `**Context:** ${summarizeDetail(managerEvent.message || 'Workspace context updated.')}`;
  }
  if (managerEvent.type === 'model') {
    return `**Model:** ${managerEvent.message || 'The model is working.'}`;
  }
  if (managerEvent.type === 'validation') {
    return `**Validation:** ${managerEvent.message || 'Checking the proposed changes.'}`;
  }
  if (managerEvent.type === 'finished') {
    return `**Ready:** ${managerEvent.message || 'The manager finished.'}`;
  }
  if (legacy.type === 'finished') {
    const paths = [
      ...new Set(
        (legacy.changes || [])
          .map((change) => change.path || change.filePath)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    return `**Ready for review:** ${legacy.message || 'Agent finished.'}${
      paths.length
        ? `\n\n**Changed files (${paths.length}):** ${paths.map(quoteDetail).join(', ')}`
        : ''
    }`;
  }
  return legacy.message || '';
};

export default function useAgentRunner({
  val,
  isAIProcessing,
  activeSession,
  agentSessionState,
  promptUiState,
  promptScope,
  promptMode,
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
  cachedModelIds = [],
  webLLMEngines = {},
}: UseAgentRunnerParams) {
  const changeSetState = requireStore(ChangeSetState.usePassiveState());
  const appState = requireStore(AppState.usePassiveState());

  const handleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      abortController?.abort();
      import('@/components/AI/WebLLMAPI').then(({ interruptWebLLM }) => interruptWebLLM());
      const sessionId = runningSessionId || agentSessionState?.activeSessionId;
      if (sessionId) {
        patchSession(sessionId, { status: 'idle', reasoning: '', reasoningEvents: [] });
        pushSessionMessage(
          sessionId,
          createSessionMessage({ role: 'system', text: 'AI Manager stopped by user.' }),
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
            text: 'AI Manager stopped by user.',
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
    (
      e: FormEvent | null = null,
      request: string | null = null,
      scope: string | null = null,
      isWelcomePrompt = false,
    ) => {
      e?.preventDefault?.();
      const userMsg = typeof request === 'string' ? request : val;
      const effectiveScope = scope || promptScope;
      if (!userMsg.trim() || isAIProcessing || !activeSession) return;

      const sessionId = activeSession.id;
      addToHistory(userMsg);
      const currentActiveTabId = tabState.activeTabId;
      const currentActiveTab = tabState.openTabs.find((tab) => tab.id === currentActiveTabId);
      pushSessionMessage(sessionId, createSessionMessage({ role: 'user', text: userMsg }));
      patchSession(sessionId, {
        status: 'running',
        reasoning: '',
        reasoningEvents: [],
        runUsage: createAgentRunUsage(),
      });
      promptUiState((draft) => {
        draft.val = '';
        draft.draftVal = '';
        draft.historyIndex = -1;
        draft.runningSessionId = sessionId;
        draft.latestManagerTrace = null;
        draft.latestAIIncident = null;
      });
      logState((draft) => {
        draft.isAIProcessing = true;
        draft.reasoning = '';
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'system',
            text: `AI Manager started in ${promptMode} mode.`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ];
      });

      const runAI = async () => {
        const runMetrics: WebLLMGenerationMetrics[] = [];
        const runRecoveries: WebLLMRecoveryEvent[] = [];
        try {
          const selectedLines =
            (currentActiveTabId && editorState.selectedLines?.[currentActiveTabId]) || [];
          const controller = new AbortController();
          promptUiState((draft) => {
            draft.abortController = controller;
          });
          const events: AgentReasoningEntry[] = [];
          let progressEventIndex: number | null = null;
          let runUsage = createAgentRunUsage();
          const publishRunUsage = () => patchSession(sessionId, { runUsage });
          const recordMetrics = (metrics: WebLLMGenerationMetrics) => {
            runMetrics.push(metrics);
            const modelIds = new Set(runUsage.modelIds);
            if (metrics.modelId) modelIds.add(metrics.modelId);
            runUsage = {
              ...runUsage,
              modelIds: [...modelIds],
              modelCalls: runUsage.modelCalls + 1,
              outcomes: {
                ...runUsage.outcomes,
                [metrics.outcome]: runUsage.outcomes[metrics.outcome] + 1,
              },
              promptTokens: runUsage.promptTokens + (metrics.promptTokens ?? 0),
              promptTokenCalls:
                runUsage.promptTokenCalls + (metrics.promptTokens === undefined ? 0 : 1),
              completionTokens: runUsage.completionTokens + (metrics.completionTokens ?? 0),
              completionTokenCalls:
                runUsage.completionTokenCalls + (metrics.completionTokens === undefined ? 0 : 1),
              totalMs: runUsage.totalMs + metrics.totalMs,
              timeToFirstTokenMs: runUsage.timeToFirstTokenMs + (metrics.timeToFirstTokenMs ?? 0),
              timeToFirstTokenCalls:
                runUsage.timeToFirstTokenCalls + (metrics.timeToFirstTokenMs === undefined ? 0 : 1),
              decodeTokensPerSecond:
                runUsage.decodeTokensPerSecond + (metrics.decodeTokensPerSecond ?? 0),
              decodeTokensPerSecondCalls:
                runUsage.decodeTokensPerSecondCalls +
                (metrics.decodeTokensPerSecond === undefined ? 0 : 1),
            };
            publishRunUsage();
          };
          const recordRecovery = (event: WebLLMRecoveryEvent) => {
            runRecoveries.push(event);
          };
          const recordTool = (tool: string) => {
            runUsage = {
              ...runUsage,
              toolCalls: { ...runUsage.toolCalls, [tool]: (runUsage.toolCalls[tool] || 0) + 1 },
            };
            publishRunUsage();
          };
          const appendReasoning = (
            line: string,
            replaceProgress = false,
            metadata: Pick<AgentReasoningEntry, 'turn' | 'input' | 'output'> = {},
          ) => {
            const entry = {
              text: line,
              timestamp: new Date().toTimeString().split(' ')[0],
              ...metadata,
              ...(metadata.input ? { input: clipReasoningStepIO(metadata.input) } : {}),
              ...(metadata.output ? { output: clipReasoningStepIO(metadata.output) } : {}),
            };
            if (replaceProgress && progressEventIndex !== null) events[progressEventIndex] = entry;
            else {
              events.push(entry);
              progressEventIndex = replaceProgress ? events.length - 1 : null;
            }
            const visible = events.slice(-MAX_REASONING_EVENTS);
            const reasoning = visible
              .map((item) => item.text)
              .filter(Boolean)
              .join('\n\n');
            patchSession(sessionId, { reasoning, reasoningEvents: visible });
            logState((draft) => {
              draft.reasoning = reasoning;
            });
          };

          appendReasoning(
            '**Routing request:** deciding which work belongs to tools and which needs the model…',
          );
          // Conversation continuity is maintained by the bounded AgentContextLedger and the
          // worker-resident model session. Do not serialize the full transcript into each run.
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
          const manager = runManager as (options: RunManagerOptions) => Promise<RunManagerResult>;
          const result = await manager({
            request: userMsg,
            mode: isWelcomePrompt ? 'edit' : promptMode,
            sessionId,
            priorContext: `Project preflight:\n${preflightSummary}`,
            scope: (effectiveScope === 'project' ? 'project' : 'file') as 'file' | 'project',
            activeFile:
              effectiveScope === 'file' && currentActiveTab?.type === 'file'
                ? currentActiveTabId
                : undefined,
            selectedLines: effectiveScope === 'file' ? selectedLines : [],
            files: workspaceFiles,
            model: selectedModel,
            signal: controller.signal,
            workspaceIndex: getWorkspaceIndex() as never,
            onMetrics: recordMetrics,
            onRecovery: recordRecovery,
            onTrace: (trace) => {
              promptUiState((draft) => {
                draft.latestManagerTrace = trace;
              });
            },
            retrieveContext: async (query, k) => {
              const lexical = (await getWorkspaceIndex()
                .queryText(query, k)
                .catch(() => [])) as Array<{
                path: string;
                preview?: string;
                score?: number;
              }>;
              return lexical.map((item) => ({
                filePath: item.path,
                content: item.preview || '',
                score: item.score || 0,
              }));
            },
            validate: async (stagedFiles) => {
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
            inspectPreview: async (stagedFiles) => {
              const logs: string[] = [];
              const compiler = new Compiler((line: string) => logs.push(line));
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
                  domSummary: evidence?.text || 'Preview evidence is available.',
                  elements: evidence?.elements || [],
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
            onEvent: (managerEvent) => {
              if (managerEvent.type === 'tool') {
                const legacyAction = managerEvent as unknown as AgentEvent;
                const tool =
                  managerEvent.tool ||
                  (typeof legacyAction.action === 'string'
                    ? legacyAction.action
                    : legacyAction.action?.action);
                if (tool) recordTool(tool);
              }
              const line = formatAgentEvent(managerEvent as unknown as AgentEvent);
              if (line) appendReasoning(line, managerEvent.replaceProgress === true);
              if (managerEvent.input || managerEvent.output) {
                appendReasoning('', false, {
                  turn: managerEvent.turn,
                  input: managerEvent.input,
                  output: managerEvent.output,
                });
              }
            },
          });

          let stillProcessing = false;
          logState((draft) => {
            stillProcessing = draft.isAIProcessing;
          });
          if (!stillProcessing) return;
          const summaryText = `[AI Manager]: ${result.summary || `Prepared ${result.changes.length} file(s) for review.`}`;
          patchSession(sessionId, { status: 'idle' });
          pushSessionMessage(sessionId, createSessionMessage({ role: 'ai', text: summaryText }));
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
            autoApprove: false,
          });
          if (isWelcomePrompt && result.changes.length > 0) {
            appendReasoning(
              '**Welcome project staged:** review the generated change set before building.',
            );
          }
          if (changeSet) {
            pushSessionMessage(
              sessionId,
              createSessionMessage({
                role: 'system',
                text: `Change set ${changeSet.id} is ready for review.`,
              }),
            );
          }
          if (deletions.length) {
            editorState((draft) => {
              const next = { ...(draft.pendingDeletions || {}) };
              for (const deletion of deletions) {
                next[deletion.path] = {
                  originalContent: deletion.before,
                  changeSetId: changeSet?.id || '',
                };
              }
              draft.pendingDeletions = next;
            });
          }
        } catch (error) {
          const isCancelled =
            error != null &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: unknown }).code === 'cancelled';
          if (isCancelled) {
            patchSession(sessionId, { status: 'idle' });
            promptUiState((draft) => {
              draft.runningSessionId = null;
              draft.abortController = null;
            });
            logState((draft) => {
              draft.isAIProcessing = false;
            });
            return;
          }
          const managerError =
            error &&
            typeof error === 'object' &&
            'changes' in error &&
            Array.isArray((error as { changes?: unknown }).changes)
              ? (error as { changes: AgentChange[] })
              : null;
          const { createAIIncident } = await import(
            /* webpackChunkName: "ai-incident" */ '@/components/AI/Agent/AIIncident'
          );
          const incident = createAIIncident({
            error,
            trace:
              error && typeof error === 'object' && 'trace' in error
                ? (error as { trace?: import('@/components/AI/Agent/ManagerTrace').ManagerTrace })
                    .trace || null
                : null,
            selectedModelId: selectedModel,
            metrics: runMetrics,
            recoveries: runRecoveries,
            cachedModelIds,
            engines: webLLMEngines,
            stagedChangeCount: managerError?.changes.length || 0,
          });
          promptUiState((draft) => {
            draft.latestAIIncident = incident;
          });
          if (managerError?.changes.length) {
            const { deletions, changeSet } = applyAgentChanges(managerError.changes, {
              editorState: editorState as never,
              sidebarState: sidebarState as never,
              logState: logState as never,
              changeSetState: changeSetState as never,
              request: userMsg,
              autoApprove: false,
            });
            if (changeSet) {
              pushSessionMessage(
                sessionId,
                createSessionMessage({
                  role: 'system',
                  text: `Partial change set ${changeSet.id} is ready for review after the manager stopped with an error.`,
                }),
              );
            }
            if (deletions.length) {
              editorState((draft) => {
                const next = { ...(draft.pendingDeletions || {}) };
                for (const deletion of deletions) {
                  next[deletion.path] = {
                    originalContent: deletion.before,
                    changeSetId: changeSet?.id || '',
                  };
                }
                draft.pendingDeletions = next;
              });
            }
          }
          const message = `AI Manager error: ${error instanceof Error ? error.message : String(error)}`;
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
      void runAI();
    },
    [
      activeSession,
      addToHistory,
      appState,
      changeSetState,
      createSessionMessage,
      editorState,
      fs,
      isAIProcessing,
      logState,
      cachedModelIds,
      webLLMEngines,
      patchSession,
      promptScope,
      promptMode,
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
