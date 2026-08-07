import type { CssCustomProperties } from '@/components/App/types';
import PromptComposer from './Composer';
import PromptHeader from './Header';
import PromptActivityArea from './PromptActivityArea';
import styles from './PromptContent.module.css';
import PromptSessionArea from './PromptSessionArea';
import type { PromptContentProps } from './prompt-types';
import { getAgentPaneContent } from './promptContentUtils';

export default function PromptContent({
  isMobile,
  isOpen,
  desktopWidth,
  header,
  session,
  activity,
  composer,
  sessionReasoning,
}: PromptContentProps) {
  const agentPaneContent = getAgentPaneContent({
    activeSession: session.activeSession,
    sessionReasoning,
    selectedModelInfo: activity.selectedModelInfo,
    isModelDownloading: activity.isModelDownloading,
    modelDownloadProgress: activity.modelDownloadProgress,
  });

  return (
    <aside
      className={`${styles.prompt} ${isOpen ? '' : styles.closed}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : ({ '--panel-width': desktopWidth } as CssCustomProperties)}
    >
      <div className={styles.content}>
        <PromptHeader {...header} copyContent={agentPaneContent} />
        <PromptSessionArea {...session} />
        <PromptActivityArea {...activity} />
        <PromptComposer {...composer} isOpen={isOpen} />
      </div>
    </aside>
  );
}
