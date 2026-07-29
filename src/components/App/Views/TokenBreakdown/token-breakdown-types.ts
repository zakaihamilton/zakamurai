import type { HighlightDebug, HighlightDebugToken } from '@/components/App/Views/EditorArea/types';
import type { Tab } from '@/components/state/domain-types';
import type { FileViewType } from '@/utils/fileViews';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';

export type CodeFold = {
  id: string;
  startLine: number;
  endLine: number;
  placeholder?: string;
};

export type TokenBreakdownReport = HighlightDebug & {
  foldLabel: string;
  collapsedFoldIds: string[];
  folds: CodeFold[];
  analysisDeferred: boolean;
};

export type ConciseTokenReport = {
  filePath: string;
  languageMode: string;
  lineCount: number;
  tokens: Array<{
    type: string;
    value: string;
    start?: number;
    end?: number;
    line?: number;
    column?: number;
  }>;
};

export type TokenVerificationResult = {
  isMatch: boolean;
  mismatches: Array<{ token: HighlightDebugToken; reason: string }>;
  reconstructedLength: number;
  originalLength: number;
};

export type TokenBreakdownTab = Tab & {
  content?: string;
  collapsedFoldIds?: string[];
  filePath?: string;
};

export type TokenBreakdownProps = {
  tab: TokenBreakdownTab;
};

export type TokenBreakdownHeaderProps = {
  filePath: string;
  fileName: string;
  copied: boolean;
  copiedCombined: boolean;
  canSwitchFileViews: boolean;
  onCopy: () => void | Promise<void>;
  onCopyCombined: () => void | Promise<void>;
  onVerifyMatch: () => void;
  onSelectView: (viewType: FileViewType) => void;
};

export type TokenFoldsSectionProps = {
  folds: CodeFold[];
  foldLabel: string;
  collapsedFoldIds: string[];
};

export type TokenJsonSectionProps = {
  report: ConciseTokenReport;
};

export type TokenNavigationSectionProps = {
  navigationTargets: TokenBreakdownReport['navigationTargets'];
  navigationLinksEnabled: boolean;
};

export type TokenSectionTabsProps = {
  activeSection: string;
  report: TokenBreakdownReport;
  onSelect: (section: string) => void;
};

export type TokenSummaryCardsProps = {
  report: TokenBreakdownReport;
};

export type TokenTableSectionProps = {
  tokens: HighlightDebugToken[];
  filteredTokens: HighlightDebugToken[];
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  typeFilter: string;
  setTypeFilter: Dispatch<SetStateAction<string>>;
  presentTypes: string[];
};

export type TokenVerificationCardProps = {
  result: TokenVerificationResult | null;
  onClose: () => void;
};

export type VerificationMetricProps = {
  label: string;
  value: string | number;
};
