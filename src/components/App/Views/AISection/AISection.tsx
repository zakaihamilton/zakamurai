import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import {
  AgentSessionState,
  getActiveAgentSession,
} from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { requireStore } from '@/components/App/types';
import { ChangeSetState } from '@/components/Workspace';
import type { Tab } from '@/components/state/domain-types';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { useState } from 'react';
import styles from './AISection.module.css';

const titleBySection = {
  context: 'AI Context',
  changes: 'Change Set',
  transcript: 'Transcript',
  reasoning: 'Progress & Reasoning',
} as const;

type AISection = keyof typeof titleBySection;

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
  const activeSession = getActiveAgentSession(agentSessionState);
  const scope = promptUiState.promptScope || 'project';
  const activeTab = tabState.openTabs.find((openTab) => openTab.id === tabState.activeTabId);
  const selectedLines =
    (tabState.activeTabId && editorState.selectedLines?.[tabState.activeTabId]) || [];
  const changeSet = (changeSetState.items || []).find(
    (item) => item.id === changeSetState.activeId,
  );
  const selectedModel = WEB_LLM_MODELS.find((model) => model.id === promptUiState.selectedModel);
  const engine = webLLMState.engines?.[promptUiState.selectedModel];

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
          : [
              engine?.status === 'downloading'
                ? `Downloading ${selectedModel?.name || 'AI model'}${engine.progressText ? ` — ${engine.progressText}` : '…'}`
                : '',
              activeSession?.reasoning || '',
            ]
              .filter(Boolean)
              .join('\n\n') || 'No progress or reasoning to show yet.';

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
      </header>
      <pre className={styles.content}>{content}</pre>
    </section>
  );
}
