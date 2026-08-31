import { applyReasoningFallback } from '@/components/AI/Agent/AgentActivity';
import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import {
  AgentSessionState,
  formatReasoningEvents,
  getActiveAgentSession,
  getLatestManagerError,
  withoutManagerErrorMessages,
} from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { TabState } from '@/components/App/Panes/TabBar';
import { requireStore } from '@/components/App/types';
import { ChangeSetState } from '@/components/Workspace';
import type { AgentReasoningEntry, AgentRunUsage, Tab } from '@/types/domain-types';
import { useEffect, useRef, useState } from 'react';
import styles from './AISection.module.css';
import AISectionChanges from './AISectionChanges';
import AISectionHeader from './AISectionHeader';
import AISectionReasoning, {
  normalizeReasoningViewType,
  type ModelProgress,
  type ReasoningGroup,
  type ReasoningViewType,
} from './AISectionReasoning';

const titleBySection = {
  changes: 'Change Set',
  reasoning: 'Progress & Reasoning',
} as const;

type AISection = keyof typeof titleBySection;

type ReasoningEntry = AgentReasoningEntry;

const STEP_PREFIX = /^\*\*Step (\d+)(?: result)?:\*\*\s*/;

const getReasoningEntries = (entries: ReasoningEntry[] | undefined, reasoning: string) =>
  entries?.length ? entries : reasoning ? [{ text: reasoning, timestamp: '' }] : [];

const formatMetric = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

export const formatRunUsageSummary = (usage: AgentRunUsage | undefined): string => {
  if (!usage) return '';
  const hasUsage = usage.modelCalls > 0 || Object.keys(usage.toolCalls).length > 0;
  if (!hasUsage) return '';
  const tokenCoverage = (reportedCalls: number) =>
    reportedCalls ? `${reportedCalls}/${usage.modelCalls} calls reported` : 'unavailable';
  const reportedTokenCalls = Math.max(usage.promptTokenCalls, usage.completionTokenCalls);
  const hasPartialTokenReporting =
    usage.promptTokenCalls !== usage.modelCalls || usage.completionTokenCalls !== usage.modelCalls;
  const hasPartialPerformanceReporting =
    usage.timeToFirstTokenCalls !== usage.modelCalls ||
    usage.decodeTokensPerSecondCalls !== usage.modelCalls;
  const outcomeText = Object.entries(usage.outcomes)
    .filter(([, count]) => count > 0)
    .map(([outcome, count]) => `${outcome}: ${count}`)
    .join(', ');
  const toolText = Object.entries(usage.toolCalls)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `- \`${name}\`: ${count}`);

  return [
    '## Run summary',
    '',
    `**Models:** ${usage.modelIds.length ? usage.modelIds.map((id) => `\`${id}\``).join(', ') : 'Unavailable'}`,
    `**Requested models:** ${usage.requestedModelIds?.length ? usage.requestedModelIds.map((id) => `\`${id}\``).join(', ') : 'Unavailable'}`,
    `**Model calls:** ${usage.modelCalls}${outcomeText ? ` (${outcomeText})` : ''}`,
    `**Task stages:** ${usage.taskKinds?.join(' → ') || 'Unavailable'}`,
    `**Recovery:** ${usage.recoveryReasons?.join(', ') || 'None'}`,
    `**Repairs:** ${usage.repairAttempts || 0}`,
    `**Final validation:** ${usage.finalValidationStatus || 'unavailable'}`,
    `**Input tokens:** ${usage.promptTokenCalls ? formatMetric(usage.promptTokens) : 'Unavailable'}`,
    `**Output tokens:** ${usage.completionTokenCalls ? formatMetric(usage.completionTokens) : 'Unavailable'}`,
    `**Total tokens:** ${reportedTokenCalls ? formatMetric(usage.promptTokens + usage.completionTokens) : 'Unavailable'}`,
    ...(hasPartialTokenReporting
      ? [
          `**Token reporting:** Input ${tokenCoverage(usage.promptTokenCalls)} · Output ${tokenCoverage(usage.completionTokenCalls)}`,
        ]
      : []),
    `**Model time:** ${formatMetric(usage.totalMs / 1000, 2)} s`,
    `**Avg. first token:** ${usage.timeToFirstTokenCalls ? `${formatMetric(usage.timeToFirstTokenMs / usage.timeToFirstTokenCalls, 0)} ms` : 'Unavailable'}`,
    `**Avg. generation speed:** ${usage.decodeTokensPerSecondCalls ? `${formatMetric(usage.decodeTokensPerSecond / usage.decodeTokensPerSecondCalls, 1)} tokens/s` : 'Unavailable'}`,
    ...(hasPartialPerformanceReporting
      ? [
          `**Performance reporting:** First token ${tokenCoverage(usage.timeToFirstTokenCalls)} · Generation speed ${tokenCoverage(usage.decodeTokensPerSecondCalls)}`,
        ]
      : []),
    '',
    '**Tools used:**',
    ...(toolText.length ? toolText : ['None']),
  ].join('\n\n');
};

export const getCompletedRunUsageSummary = (
  status: string | undefined,
  usage: AgentRunUsage | undefined,
): string => (status === 'running' ? '' : formatRunUsageSummary(usage));

export const groupReasoningEntries = (entries: ReasoningEntry[]): ReasoningGroup[] => {
  const groups: ReasoningGroup[] = [];

  for (const entry of entries) {
    const match = entry.text.match(STEP_PREFIX);
    const step = match ? Number(match[1]) : null;
    const text = match ? entry.text.slice(match[0].length) : entry.text;
    const previousGroup = groups.at(-1);

    if (step !== null && previousGroup?.step === step) {
      previousGroup.entries.push({ ...entry, text });
    } else {
      groups.push({ step, entries: [{ ...entry, text }] });
    }
  }

  return groups;
};

export { keyReasoningEntries } from './AISectionReasoning';

function getSection(tab: Tab): AISection {
  const section = tab.id.replace('ai-section:', '');
  return section in titleBySection ? (section as AISection) : 'reasoning';
}

export default function AISectionView({ tab }: { tab: Tab }) {
  const section = getSection(tab);
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const changeSetState = requireStore(ChangeSetState.useState(['activeId', 'items']));
  const tabState = requireStore(TabState.useState(['openTabs']));
  const webLLMState = requireStore(WebLLMState.useState(['engines']));
  const promptUiState = requireStore(PromptUiState.useState(['selectedModel']));
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeSession = getActiveAgentSession(agentSessionState);
  const [showStepIO, setShowStepIO] = useState(activeSession?.showStepIO === true);
  const changeSet = (changeSetState.items || []).find(
    (item) => item.id === changeSetState.activeId,
  );
  const selectedModel = WEB_LLM_MODELS.find((model) => model.id === promptUiState.selectedModel);
  const engine = webLLMState.engines?.[promptUiState.selectedModel];
  const reasoningEntries = getReasoningEntries(
    activeSession?.reasoningEvents,
    activeSession?.reasoning || '',
  );
  const displayedReasoningEntries = reasoningEntries
    .map((entry) => ({
      ...entry,
      text: showStepIO ? formatReasoningEvents([entry], true) : entry.text,
    }))
    .filter((entry) => entry.text);
  const modelProgress: ModelProgress | undefined =
    engine?.status === 'downloading'
      ? {
          modelName: selectedModel?.name || 'AI model',
          progress:
            typeof engine.progress === 'number' && Number.isFinite(engine.progress)
              ? Math.min(Math.max(engine.progress, 0), 1)
              : null,
          detail: engine.progressText || 'Preparing model…',
        }
      : undefined;
  const modelProgressText = modelProgress
    ? `Downloading ${modelProgress.modelName} — ${modelProgress.detail}`
    : '';
  const reasoningContent = [
    ...(modelProgressText ? [{ text: modelProgressText, timestamp: '' }] : []),
    ...displayedReasoningEntries,
  ];
  const transcriptMessages = withoutManagerErrorMessages(activeSession?.messages || []);
  const transcriptText = transcriptMessages.length
    ? transcriptMessages
        .map((message) => `[${message.timestamp || 'now'}] ${message.role}: ${message.text}`)
        .join('\n\n')
    : '';
  const reasoningGroups = groupReasoningEntries(reasoningContent);
  const runUsageSummary = getCompletedRunUsageSummary(
    activeSession?.status,
    activeSession?.runUsage,
  );
  const latestError = getLatestManagerError(activeSession);
  const activity = activeSession?.activity?.nodes.length
    ? activeSession.activity
    : applyReasoningFallback(
        transcriptMessages.find((message) => message.role === 'user')?.text || '',
        reasoningEntries,
        activeSession?.status || 'idle',
      );
  const currentTab = tabState.openTabs.find((openTab) => openTab.id === tab.id) || tab;
  const reasoningView = normalizeReasoningViewType(currentTab.viewType);

  useEffect(() => {
    setShowStepIO(activeSession?.showStepIO === true);
  }, [activeSession?.showStepIO]);

  const toggleStepIO = () => {
    const next = !showStepIO;
    setShowStepIO(next);
    agentSessionState((draft) => {
      const sessionId = draft.activeSessionId;
      if (sessionId && draft.sessions[sessionId]) draft.sessions[sessionId].showStepIO = next;
    });
  };

  const selectReasoningView = (viewType: ReasoningViewType) => {
    if (section !== 'reasoning') return;
    tabState((draft) => {
      draft.openTabs = draft.openTabs.map((openTab) =>
        openTab.id === tab.id ? { ...openTab, viewType } : openTab,
      );
    });
  };

  const content =
    section === 'changes'
      ? changeSet
        ? [
            `Status: ${changeSet.status}`,
            `Request: ${changeSet.request}`,
            '',
            'Files:',
            ...changeSet.files.map((file) => `- ${file.path} (${file.status || 'pending review'})`),
          ].join('\n')
        : 'No active change set.'
      : reasoningContent.length || transcriptText || latestError
        ? [
            transcriptText ? `--- Transcript ---\n${transcriptText}` : '',
            ...reasoningContent.map(
              ({ text, timestamp }) => `${timestamp ? `[${timestamp}] ` : ''}${text}`,
            ),
            runUsageSummary,
            latestError ? `--- Latest error ---\n${latestError}` : '',
          ]
            .filter(Boolean)
            .join('\n\n')
        : runUsageSummary || 'No progress or reasoning to show yet.';

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.page} aria-label={titleBySection[section]}>
      <AISectionHeader
        title={titleBySection[section]}
        showStepIOToggle={section === 'reasoning'}
        showStepIO={section === 'reasoning' && showStepIO}
        showViewToggle={section === 'reasoning'}
        viewType={reasoningView}
        showTimelineToggle={section === 'reasoning' && reasoningView === 'visual'}
        timelineExpanded={timelineExpanded}
        onToggleTimeline={() => setTimelineExpanded((expanded) => !expanded)}
        showAutoScrollToggle={section === 'reasoning'}
        autoScroll={section === 'reasoning' && autoScroll}
        copied={copied}
        onToggleStepIO={toggleStepIO}
        onSelectView={selectReasoningView}
        onToggleAutoScroll={() => setAutoScroll((enabled) => !enabled)}
        onCopy={copy}
      />
      {section === 'reasoning' ? (
        <AISectionReasoning
          activeSession={activeSession}
          reasoningGroups={reasoningGroups}
          activity={activity}
          modelProgress={modelProgress}
          timelineExpanded={timelineExpanded}
          viewType={reasoningView}
          showStepIO={showStepIO}
          runUsageSummary={runUsageSummary}
          latestError={latestError}
          fallbackContent={content}
          content={content}
          contentRef={contentRef}
          autoScroll={autoScroll}
          onUserScroll={(enabled) => setAutoScroll(enabled)}
        />
      ) : (
        <AISectionChanges content={content} />
      )}
    </section>
  );
}
