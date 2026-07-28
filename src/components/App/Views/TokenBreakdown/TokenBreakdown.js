import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { getHighlightBreakdown } from '@/components/App/Views/EditorArea/highlighter';
import { shouldDeferEditorAnalysis } from '@/components/App/Views/EditorArea/largeFile';
import { Icons } from '@/components/ui/Icons';
import { useMemo, useState } from 'react';
import styles from './TokenBreakdown.module.css';
import TokenBreakdownHeader from './TokenBreakdownHeader';
import TokenFoldsSection from './TokenFoldsSection';
import TokenJsonSection from './TokenJsonSection';
import TokenNavigationSection from './TokenNavigationSection';
import TokenSectionTabs from './TokenSectionTabs';
import TokenSummaryCards from './TokenSummaryCards';
import TokenTableSection from './TokenTableSection';
import TokenVerificationCard from './TokenVerificationCard';
import {
  checkTokenReportMatch,
  compareTokensBySourceOrder,
  getFoldLabel,
  getFolds,
  getTokenLabel,
} from './tokenUtils';

export default function TokenBreakdown({ tab }) {
  const editorState = EditorState.useState(['fileContents', 'pendingDiffs']);
  const tabState = TabState.useState(['activeTabId', 'openTabs']);
  const [copied, setCopied] = useState(false);
  const [copiedCombined, setCopiedCombined] = useState(false);
  const [activeSection, setActiveSection] = useState('tokens');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [verificationResult, setVerificationResult] = useState(null);

  const filePath = tab?.sourceFilePath || tab?.filePath || tab?.file?.path?.join('/') || '';
  const fileName = tab?.file?.name || filePath.split('/').pop() || '';
  const code = editorState.fileContents?.[filePath] ?? tab?.content ?? '';
  const collapsedFoldIds = tab?.collapsedFoldIds || [];
  const isFileView = tab?.type === 'file';
  const canSwitchFileViews = isFileView || !!filePath;

  const handleSelectView = (viewType) => {
    tabState((draft) => {
      if (isFileView) {
        draft.openTabs = draft.openTabs.map((openTab) =>
          openTab.id === tab.id ? { ...openTab, viewType } : openTab,
        );
        return;
      }

      const path = filePath.split('/').filter(Boolean);
      const existingFileTab = draft.openTabs.find((openTab) => openTab.id === filePath);
      if (!existingFileTab) {
        draft.openTabs = [
          ...draft.openTabs,
          {
            id: filePath,
            type: 'file',
            label: fileName,
            viewType,
            file: { name: fileName, path, content: code },
          },
        ];
      } else {
        draft.openTabs = draft.openTabs.map((openTab) =>
          openTab.id === filePath ? { ...openTab, viewType } : openTab,
        );
      }
      draft.activeTabId = filePath;
    });
  };

  const report = useMemo(() => {
    const breakdown = getHighlightBreakdown({
      code,
      filePath,
      state: editorState,
      styles,
      navigationLinksEnabled: true,
    });
    const analysisDeferred = shouldDeferEditorAnalysis(code);
    const folds = analysisDeferred ? [] : getFolds(code, filePath);
    return {
      ...breakdown,
      foldLabel: getFoldLabel(filePath),
      collapsedFoldIds,
      folds,
      analysisDeferred,
    };
  }, [code, filePath, editorState, collapsedFoldIds]);

  const orderedTokens = useMemo(
    () => [...report.tokens].sort(compareTokensBySourceOrder),
    [report.tokens],
  );

  const conciseReport = useMemo(() => {
    return {
      filePath: report.filePath,
      languageMode: report.languageMode,
      lineCount: report.lineCount,
      tokens: orderedTokens.map((t) => ({
        type: t.type,
        value: t.value,
        start: t.range?.start,
        end: t.range?.end,
        line: t.range?.startPosition?.line,
        column: t.range?.startPosition?.column,
      })),
    };
  }, [report, orderedTokens]);

  const handleCopy = async () => {
    const text = JSON.stringify(conciseReport, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleCopyCombined = async () => {
    const text = `Explain why the tokens in the token breakdown do not match the source file. Here is the source file:

${code}

Here is the token breakdown:

${JSON.stringify(conciseReport, null, 2)}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setCopiedCombined(true);
      window.setTimeout(() => setCopiedCombined(false), 1200);
    }
  };

  const handleVerifyMatch = () => {
    const result = checkTokenReportMatch(code, report);
    setVerificationResult(result);
  };

  const presentTypes = useMemo(() => {
    const types = new Set(orderedTokens.map((t) => t.type));
    return ['All', ...Array.from(types)];
  }, [orderedTokens]);

  const filteredTokens = useMemo(() => {
    return orderedTokens.filter((token) => {
      const matchesSearch =
        searchTerm === '' ||
        String(token.value).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getTokenLabel(token.type).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(token.type).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'All' || token.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [orderedTokens, searchTerm, typeFilter]);

  if (!filePath) {
    return (
      <div className={styles.breakdownView}>
        <div className={styles.emptyState}>No source file is attached to this token breakdown.</div>
      </div>
    );
  }

  return (
    <div className={styles.breakdownView}>
      <TokenBreakdownHeader
        filePath={filePath}
        fileName={fileName}
        copied={copied}
        copiedCombined={copiedCombined}
        canSwitchFileViews={canSwitchFileViews}
        onCopy={handleCopy}
        onCopyCombined={handleCopyCombined}
        onVerifyMatch={handleVerifyMatch}
        onSelectView={handleSelectView}
      />
      <div className={styles.shell}>
        <TokenSummaryCards report={report} />
        <TokenVerificationCard
          result={verificationResult}
          onClose={() => setVerificationResult(null)}
        />

        {report.largeFileFallback && (
          <div className={styles.notice}>
            <Icons.Info size={16} />
            <span>
              This file is large, so syntax, folds, token, and navigation analysis are deferred.
            </span>
          </div>
        )}

        <TokenSectionTabs
          activeSection={activeSection}
          report={report}
          onSelect={setActiveSection}
        />

        <section className={styles.section}>
          {activeSection === 'tokens' && (
            <TokenTableSection
              tokens={report.tokens}
              filteredTokens={filteredTokens}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              presentTypes={presentTypes}
            />
          )}

          {activeSection === 'folds' && (
            <TokenFoldsSection
              folds={report.folds}
              foldLabel={report.foldLabel}
              collapsedFoldIds={collapsedFoldIds}
            />
          )}

          {activeSection === 'navigation' && (
            <TokenNavigationSection
              navigationTargets={report.navigationTargets}
              navigationLinksEnabled={report.navigationLinksEnabled}
            />
          )}

          {activeSection === 'json' && <TokenJsonSection report={conciseReport} />}
        </section>
      </div>
    </div>
  );
}
