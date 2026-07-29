import type { LogEntry } from '@/components/state/domain-types';
import type { ChangeEvent } from 'react';

export type VisibleLogEntry = {
  log: LogEntry;
  displayIndex: number;
};

export type LogItemProps = {
  log: LogEntry;
  displayIndex: number;
};

export type ProcessingLogItemProps = {
  lineNumber: number;
  message: string;
  processingClassName: string;
};

export type LogListProps = {
  visibleLogs: VisibleLogEntry[];
  totalLogsCount: number;
  filterText: string;
  isProcessing: boolean;
  isAIProcessing: boolean;
  isSystemProcessing: boolean;
};

export type LogToolbarProps = {
  filterText: string;
  onFilterChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearFilter: () => void;
  copied: boolean;
  onCopyAll: () => void;
  onClearLogs: () => void;
};

export type LogScrollButtonProps = {
  onScrollToBottom: () => void;
};
