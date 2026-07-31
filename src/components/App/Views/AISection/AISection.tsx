import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import {
  AgentSessionState,
  formatReasoningEvents,
  getActiveAgentSession,
} from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { requireStore } from '@/components/App/types';
import { ChangeSetState } from '@/components/Workspace';
import type { AgentReasoningEntry, AgentRunUsage, Tab } from '@/components/state/domain-types';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './AISection.module.css';

const titleBySection = {
  context: 'AI Context',
  changes: 'Change Set',
  transcript: 'Transcript',
  reasoning: 'Progress & Reasoning',
} as const;

type AISection = keyof typeof titleBySection;

type ReasoningEntry = AgentReasoningEntry;
type ReasoningGroup = { step: number | null; entries: ReasoningEntry[] };

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
    `**Model calls:** ${usage.modelCalls}${outcomeText ? ` (${outcomeText})` : ''}`,
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

function getSection(tab: Tab): AISection {
  const section = tab.id.replace('ai-section:', '');
  return section in titleBySection ? (section as AISection) : 'context';
}

export default function AISectionView({ tab }: { tab: Tab }) {
  const section = getSection(tab);
  const promptUiState = requireStore(PromptUiState.useState(['promptScope', 'selectedModel']));
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs']));
  const editorState = requireStore(EditorState.useState(['selectedLines']));
  const logState = requireStore(LogState.useState(['isAIProcessing', 'isSystemProcessing']));
  const agentSessionState = requireStore(
    AgentSessionState.useState(['sessions', 'activeSessionId']),
  );
  const changeSetState = requireStore(ChangeSetState.useState(['activeId', 'items']));
  const webLLMState = requireStore(WebLLMState.useState(['engines']));
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeSession = getActiveAgentSession(agentSessionState);
  const [showStepIO, setShowStepIO] = useState(activeSession?.showStepIO === true);
  const scope = promptUiState.promptScope || 'project';
  const activeTab = tabState.openTabs.find((openTab) => openTab.id === tabState.activeTabId);
  const selectedLines =
    (tabState.activeTabId && editorState.selectedLines?.[tabState.activeTabId]) || [];
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
  const modelProgress =
    engine?.status === 'downloading'
      ? `Downloading ${selectedModel?.name || 'AI model'}${engine.progressText ? ` — ${engine.progressText}` : '…'}`
      : '';
  const reasoningContent = [
    ...(modelProgress ? [{ text: modelProgress, timestamp: '' }] : []),
    ...displayedReasoningEntries,
  ];
  const reasoningGroups = groupReasoningEntries(reasoningContent);
  const runUsageSummary = getCompletedRunUsageSummary(
    activeSession?.status,
    activeSession?.runUsage,
  );

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

  const content =
    section === 'context'
      ? [
          `Scope: ${scope === 'project' ? 'Project' : 'File'}`,
          `Target: ${scope === 'project' ? 'Whole project' : activeTab?.label || 'No file selected'}`,
          scope === 'file'
            ? `Selection: ${selectedLines.length ? `Lines ${selectedLines.join(', ')}` : 'None'}`
            : '',
          `State: ${logState.isAIProcessing ? 'AI working' : logState.isSystemProcessing ? 'Compiling' : 'Ready'}`,
        ]
          .filter(Boolean)
          .join('\n')
      : section === 'changes'
        ? changeSet
          ? [
              `Status: ${changeSet.status}`,
              `Request: ${changeSet.request}`,
              '',
              'Files:',
              ...changeSet.files.map(
                (file) => `- ${file.path} (${file.status || 'pending review'})`,
              ),
            ].join('\n')
          : 'No active change set.'
        : section === 'transcript'
          ? activeSession?.messages.length
            ? activeSession.messages
                .map(
                  (message) => `[${message.timestamp || 'now'}] ${message.role}: ${message.text}`,
                )
                .join('\n\n')
            : 'Start a conversation with this agent session.'
          : reasoningContent.length
            ? [
                ...reasoningContent.map(
                  ({ text, timestamp }) => `${timestamp ? `[${timestamp}] ` : ''}${text}`,
                ),
                runUsageSummary,
              ]
                .filter(Boolean)
                .join('\n\n')
            : runUsageSummary || 'No progress or reasoning to show yet.';

  useEffect(() => {
    if (section !== 'reasoning' || !content || !contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [content, section]);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.page} aria-label={titleBySection[section]}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>AI pane</span>
          <h1>{titleBySection[section]}</h1>
        </div>
        <div className={styles.actions}>
          {section === 'reasoning' ? (
            <Tooltip content={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}>
              <button
                type="button"
                className={`${styles.stepIOToggle} ${showStepIO ? styles.stepIOToggleActive : ''}`}
                onClick={toggleStepIO}
                aria-label={`${showStepIO ? 'Hide' : 'Show'} input/output for each agent step`}
                aria-pressed={showStepIO}
              >
                <Icons.Terminal size={16} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content={copied ? 'Copied!' : 'Copy to clipboard'}>
            <button
              type="button"
              className={styles.copyButton}
              onClick={copy}
              aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
            >
              {copied ? <Icons.Check size={16} /> : <Icons.Copy size={16} />}
            </button>
          </Tooltip>
        </div>
      </header>
      {section === 'reasoning' ? (
        <div ref={contentRef} className={`${styles.content} ${styles.markdownContent}`}>
          {(reasoningGroups.length
            ? reasoningGroups
            : [{ step: null, entries: [{ text: content, timestamp: '' }] }]
          ).map((group, groupIndex) => (
            <section className={styles.reasoningGroup} key={`${group.step}-${groupIndex}`}>
              {group.step !== null ? (
                <h2 className={styles.stepHeading}>Step {group.step}</h2>
              ) : null}
              {group.entries.map(({ text, timestamp }) => (
                <article className={styles.reasoningEntry} key={`${timestamp}-${text}`}>
                  {timestamp ? <time className={styles.timestamp}>{timestamp}</time> : null}
                  <div className={styles.reasoningText}>
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => <a className={styles.link} {...props} />,
                        blockquote: ({ node, ...props }) => (
                          <blockquote className={styles.blockquote} {...props} />
                        ),
                        code: ({ node, ...props }) => <code className={styles.code} {...props} />,
                        h1: ({ node, ...props }) => <h1 className={styles.heading} {...props} />,
                        h2: ({ node, ...props }) => <h2 className={styles.heading} {...props} />,
                        h3: ({ node, ...props }) => <h3 className={styles.heading} {...props} />,
                        h4: ({ node, ...props }) => <h4 className={styles.heading} {...props} />,
                        h5: ({ node, ...props }) => <h5 className={styles.heading} {...props} />,
                        h6: ({ node, ...props }) => <h6 className={styles.heading} {...props} />,
                        li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
                        ol: ({ node, ...props }) => <ol className={styles.list} {...props} />,
                        p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
                        pre: ({ node, ...props }) => <pre className={styles.pre} {...props} />,
                        ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
                      }}
                    >
                      {text}
                    </ReactMarkdown>
                  </div>
                </article>
              ))}
            </section>
          ))}
          {runUsageSummary ? (
            <section className={styles.runSummary}>
              <ReactMarkdown
                components={{
                  code: ({ node, ...props }) => <code className={styles.code} {...props} />,
                  h2: ({ node, ...props }) => <h2 className={styles.stepHeading} {...props} />,
                  li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
                  p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
                  ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
                }}
              >
                {runUsageSummary}
              </ReactMarkdown>
            </section>
          ) : null}
        </div>
      ) : (
        <pre className={styles.content}>{content}</pre>
      )}
    </section>
  );
}
