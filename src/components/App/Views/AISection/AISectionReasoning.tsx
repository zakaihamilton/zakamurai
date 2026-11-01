import { applyReasoningFallback } from '@/components/AI/Agent/AgentActivity';
import { withoutManagerErrorMessages } from '@/components/App/Panes/Prompt/AgentSessions';
import type { AgentActivityState, AgentSession } from '@/types/domain-types';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import styles from './AISectionReasoning.module.css';
import type { ModelProgress, ReasoningGroup, ReasoningViewType } from './AISectionReasoningUtils';
import TextReasoning from './ReasoningText';
import VisualReasoning from './VisualReasoning';

const noop = () => undefined;

export {
  extractReasoningLabel,
  getNextActivityNode,
  getProgressRoadmap,
  getRecentMilestones,
  getLiveExecutionInfo,
  getReasoningEntryStatus,
  getReasoningGroupStatus,
  getRunStatus,
  keyReasoningEntries,
  normalizeReasoningViewType,
  stripReasoningLabel,
} from './AISectionReasoningUtils';
export type {
  LiveExecutionInfo,
  ModelProgress,
  ProgressRoadmapStage,
  ProgressRoadmapStageId,
  ProgressRoadmapStageStatus,
  ReasoningGroup,
  ReasoningViewType,
  TimelineStatus,
} from './AISectionReasoningUtils';

type AISectionReasoningProps = {
  activeSession: AgentSession | null;
  reasoningGroups: ReasoningGroup[];
  visualReasoningGroups?: ReasoningGroup[];
  activity?: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded?: boolean;
  viewType?: ReasoningViewType;
  showStepIO?: boolean;
  onToggleTimeline?: () => void;
  onToggleStepIO?: () => void;
  runUsageSummary: string;
  latestError?: string;
  fallbackContent: string;
  content: string;
  contentRef: RefObject<HTMLDivElement | null>;
  autoScroll?: boolean;
  onUserScroll?: (autoScroll: boolean) => void;
};

export default function AISectionReasoning({
  activeSession,
  reasoningGroups,
  visualReasoningGroups = reasoningGroups,
  activity,
  modelProgress,
  timelineExpanded = false,
  viewType = 'visual',
  showStepIO = false,
  onToggleTimeline = noop,
  onToggleStepIO = noop,
  runUsageSummary,
  latestError = '',
  fallbackContent,
  content,
  contentRef,
  autoScroll = true,
  onUserScroll,
}: AISectionReasoningProps) {
  const transcriptMessages = withoutManagerErrorMessages(activeSession?.messages || []);
  const lastScrollTop = useRef(0);
  const visualActivity =
    activity ||
    applyReasoningFallback(
      transcriptMessages.find((message) => message.role === 'user')?.text || '',
      visualReasoningGroups.flatMap((group) => group.entries),
      activeSession?.status || 'idle',
    );

  const handleScroll = () => {
    if (viewType !== 'text') return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    const { scrollTop, scrollHeight, clientHeight } = contentElement;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

    if (isAtBottom) {
      onUserScroll?.(true);
    } else if (scrollTop < lastScrollTop.current && autoScroll) {
      onUserScroll?.(false);
    }
    lastScrollTop.current = scrollTop;
  };

  useEffect(() => {
    if (viewType !== 'text' || !autoScroll || !content || !contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [autoScroll, content, contentRef, viewType]);

  const visualMode = viewType !== 'text';

  return (
    <div
      ref={contentRef}
      className={`${styles.content} ${styles.markdownContent}${visualMode ? ` ${styles.visualContent}` : ''}`}
      onScroll={handleScroll}
    >
      {viewType === 'text' ? (
        <TextReasoning
          messages={transcriptMessages}
          groups={reasoningGroups}
          runUsageSummary={runUsageSummary}
          latestError={latestError}
          fallbackContent={fallbackContent}
        />
      ) : (
        <VisualReasoning
          activeSession={activeSession}
          activity={visualActivity}
          modelProgress={modelProgress}
          viewType={viewType}
          timelineExpanded={timelineExpanded}
          onToggleTimeline={onToggleTimeline}
          onToggleStepIO={onToggleStepIO}
          runUsageSummary={runUsageSummary}
          latestError={latestError}
          showStepIO={showStepIO}
        />
      )}
    </div>
  );
}
