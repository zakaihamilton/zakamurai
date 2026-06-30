import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { getCssBlockFolds, isCssPath } from '@/components/App/Views/EditorArea/CssFolding';
import editorStyles from '@/components/App/Views/EditorArea/EditorArea.module.css';
import {
  getJavaScriptBlockFolds,
  isJavaScriptPath,
} from '@/components/App/Views/EditorArea/JavaScriptFolding';
import { getJsonObjectFolds, isJsonPath } from '@/components/App/Views/EditorArea/JsonFolding';
import { getHighlightBreakdown } from '@/components/App/Views/EditorArea/highlighter';
import FileViewToolbar from '@/components/App/Views/FileViewToolbar';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { useMemo, useState } from 'react';
import styles from './TokenBreakdown.module.css';
import TokenFoldsSection from './TokenFoldsSection';
import TokenJsonSection from './TokenJsonSection';
import TokenNavigationSection from './TokenNavigationSection';
import TokenSummaryCards from './TokenSummaryCards';
import TokenTableSection from './TokenTableSection';

const TOKEN_LABELS = {
  hlAttr: 'Attribute',
  hlComment: 'Comment',
  hlFunc: 'Function',
  hlJsonBool: 'JSON Literal',
  hlJsonKey: 'JSON Key',
  hlJsonPunc: 'JSON Punctuation',
  hlKw: 'Keyword',
  hlNum: 'Number',
  hlProp: 'Property',
  hlStr: 'String',
  hlTag: 'Tag',
  hlVal: 'Value',
};

const getTokenLabel = (type = '') => TOKEN_LABELS[type] || type.replace(/^hl/, '') || 'Token';

const getFolds = (code, filePath) => {
  if (isJsonPath(filePath)) return getJsonObjectFolds(code, filePath);
  if (isCssPath(filePath)) return getCssBlockFolds(code, filePath);
  return getJavaScriptBlockFolds(code, filePath);
};

const getFoldLabel = (filePath) => {
  if (isJsonPath(filePath)) return 'JSON object';
  if (isCssPath(filePath)) return 'CSS block';
  if (isJavaScriptPath(filePath)) return 'code block';
  return 'fold';
};

const compareTokensBySourceOrder = (a, b) => {
  const aStart = a.range?.start ?? Number.POSITIVE_INFINITY;
  const bStart = b.range?.start ?? Number.POSITIVE_INFINITY;
  if (aStart !== bStart) return aStart - bStart;
  const aEnd = a.range?.end ?? 0;
  const bEnd = b.range?.end ?? 0;
  if (aEnd !== bEnd) return aEnd - bEnd;
  return a.index - b.index;
};

const checkTokenReportMatch = (code, report) => {
  const tokens = [...report.tokens].sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0));
  let reconstructed = '';
  let lastIdx = 0;
  const mismatches = [];

  for (const token of tokens) {
    const start = token.range?.start;
    const end = token.range?.end;
    const value = token.value;

    if (start === undefined || end === undefined) {
      mismatches.push({
        token,
        reason: `Missing range for token "${value}"`,
      });
      continue;
    }

    if (start > lastIdx) {
      reconstructed += code.substring(lastIdx, start);
    } else if (start < lastIdx) {
      mismatches.push({
        token,
        reason: `Overlap: Token starts at ${start}, previous ended at ${lastIdx}`,
      });
    }

    const originalValue = code.substring(start, end);
    if (originalValue !== value) {
      mismatches.push({
        token,
        reason: `Value mismatch: report has "${value}" but file has "${originalValue}"`,
      });
    }

    reconstructed += value;
    lastIdx = end;
  }

  if (lastIdx < code.length) {
    reconstructed += code.substring(lastIdx);
  }

  const isMatch = reconstructed === code && mismatches.length === 0;

  return {
    isMatch,
    mismatches,
    reconstructedLength: reconstructed.length,
    originalLength: code.length,
  };
};

export default function TokenBreakdown({ tab }) {
  const editorState = EditorState.useState();
  const tabState = TabState.useState();
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
      styles: editorStyles,
      navigationLinksEnabled: true,
    });
    const folds = getFolds(code, filePath);
    return {
      ...breakdown,
      foldLabel: getFoldLabel(filePath),
      collapsedFoldIds,
      folds,
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
      <div className={editorStyles.editorHeader}>
        <div className={editorStyles.headerTitle}>
          <Icons.Tokens size={16} />
          <span className={editorStyles.filePath}>{filePath}</span>
        </div>
        <div className={editorStyles.headerActions}>
          {process.env.NODE_ENV === 'development' && (
            <Tooltip content="Verify token report match">
              <button
                type="button"
                className={editorStyles.actionBtn}
                onClick={handleVerifyMatch}
                aria-label="Verify token report match"
              >
                <Icons.Check />
              </button>
            </Tooltip>
          )}
          <Tooltip content={copied ? 'Copied!' : 'Copy token breakdown'}>
            <button
              type="button"
              className={`${editorStyles.actionBtn} ${copied ? styles.copyButtonCopied : ''}`}
              onClick={handleCopy}
              aria-live="polite"
              aria-label={copied ? 'Copied!' : 'Copy token breakdown'}
            >
              {copied ? <Icons.Check /> : <Icons.Copy />}
            </button>
          </Tooltip>
          {process.env.NODE_ENV === 'development' && (
            <Tooltip content={copiedCombined ? 'Copied!' : 'Copy troubleshooting prompt'}>
              <button
                type="button"
                className={`${editorStyles.actionBtn} ${copiedCombined ? styles.copyButtonCopied : ''}`}
                onClick={handleCopyCombined}
                aria-live="polite"
                aria-label={copiedCombined ? 'Copied!' : 'Copy troubleshooting prompt'}
              >
                {copiedCombined ? <Icons.Check /> : <Icons.Brain />}
              </button>
            </Tooltip>
          )}
          {canSwitchFileViews && (
            <FileViewToolbar
              fileName={fileName}
              activeViewType={FILE_VIEW_TYPES.TOKEN_BREAKDOWN}
              onSelectView={handleSelectView}
            />
          )}
        </div>
      </div>
      <div className={styles.shell}>
        <TokenSummaryCards report={report} />

        {verificationResult && (
          <div className={styles.verificationCard}>
            <div className={styles.verificationCardHeader}>
              <div className={styles.verificationTitleGroup}>
                <span className={styles.verificationTitle}>Token Report Alignment Check</span>
                <span
                  className={`${styles.verificationStatus} ${
                    verificationResult.isMatch ? styles.statusSuccess : styles.statusError
                  }`}
                >
                  {verificationResult.isMatch ? 'Match Success' : 'Mismatch Found'}
                </span>
              </div>
              <button
                type="button"
                className={styles.verificationClose}
                onClick={() => setVerificationResult(null)}
                aria-label="Close check results"
              >
                <Icons.Close />
              </button>
            </div>
            <div className={styles.verificationDetails}>
              <div className={styles.verificationMetrics}>
                <div className={styles.verificationMetric}>
                  <span className={styles.metricLabel}>Original Length</span>
                  <span className={styles.metricValue}>
                    {verificationResult.originalLength} chars
                  </span>
                </div>
                <div className={styles.verificationMetric}>
                  <span className={styles.metricLabel}>Reconstructed</span>
                  <span className={styles.metricValue}>
                    {verificationResult.reconstructedLength} chars
                  </span>
                </div>
                <div className={styles.verificationMetric}>
                  <span className={styles.metricLabel}>Total Mismatches</span>
                  <span className={styles.metricValue}>{verificationResult.mismatches.length}</span>
                </div>
              </div>
              {verificationResult.mismatches.length > 0 && (
                <ul className={styles.mismatchList}>
                  {verificationResult.mismatches.map((m, idx) => (
                    <li
                      key={`${m.token.value}-${m.token.range?.start ?? idx}-${idx}`}
                      className={styles.mismatchItem}
                    >
                      <span className={styles.mismatchItemReason}>{m.reason}</span>
                      <span className={styles.mismatchItemDetails}>
                        Token: "{m.token.value}" | Type: {m.token.type} | Range: [
                        {m.token.range?.start}, {m.token.range?.end}]
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {report.largeFileFallback && (
          <div className={styles.notice}>
            <Icons.Info size={16} />
            <span>
              This file is above the highlighter limit and is rendered as escaped plain text.
            </span>
          </div>
        )}

        <nav className={styles.sectionTabs} aria-label="Token breakdown sections">
          {[
            ['tokens', 'Tokens', report.tokens.length],
            ['folds', 'Folds', report.folds.length],
            ['navigation', 'Navigation', report.navigationTargets.length],
            ['json', 'Raw JSON', null],
          ].map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`${styles.sectionTab} ${activeSection === id ? styles.sectionTabActive : ''}`}
              onClick={() => setActiveSection(id)}
              aria-pressed={activeSection === id}
            >
              <span>{label}</span>
              {count !== null && <strong>{count}</strong>}
            </button>
          ))}
        </nav>

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
