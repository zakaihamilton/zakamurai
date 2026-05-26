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
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { FILE_VIEW_TYPES } from '@/utils/fileViews';
import { useMemo, useState } from 'react';
import styles from './TokenBreakdown.module.css';

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

const previewValue = (value = '') => {
  const normalized = String(value).replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

const getTokenTone = (type = '') => {
  if (type.includes('Json')) return styles.toneJson;
  if (type.includes('Str')) return styles.toneString;
  if (type.includes('Kw')) return styles.toneKeyword;
  if (type.includes('Comment')) return styles.toneComment;
  if (type.includes('Num')) return styles.toneNumber;
  if (type.includes('Tag')) return styles.toneTag;
  if (type.includes('Func')) return styles.toneFunction;
  if (type.includes('Attr') || type.includes('Prop')) return styles.toneProperty;
  return styles.toneDefault;
};

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

export default function TokenBreakdown({ tab }) {
  const editorState = EditorState.useState();
  const tabState = TabState.useState();
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState('tokens');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

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

  const handleCopy = async () => {
    const text = JSON.stringify(report, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  // List of present token types to display as quick-filter pills
  const presentTypes = useMemo(() => {
    const types = new Set(report.tokens.map((t) => t.type));
    return ['All', ...Array.from(types)];
  }, [report.tokens]);

  // Filtered tokens based on search term & type filter
  const filteredTokens = useMemo(() => {
    return report.tokens.filter((token) => {
      const matchesSearch =
        searchTerm === '' ||
        String(token.value).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getTokenLabel(token.type).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(token.type).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'All' || token.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [report.tokens, searchTerm, typeFilter]);

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
        <section className={styles.summaryGrid} aria-label="Token breakdown summary">
          <div className={`${styles.summaryCard} ${styles.summaryMode}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Mode</span>
              <span className={styles.summaryCardIcon}>
                <Icons.Code size={14} />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.languageMode}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryTokens}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Tokens</span>
              <span className={styles.summaryCardIcon}>
                <Icons.Tokens size={14} />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.tokens.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryLines}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Lines</span>
              <span className={styles.summaryCardIcon}>
                <Icons.Terminal size={14} />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.lineCount}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryFolds}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Folds</span>
              <span className={styles.summaryCardIcon}>
                <Icons.ChevronDown />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.folds.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryNav}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Nav Targets</span>
              <span className={styles.summaryCardIcon}>
                <Icons.Globe size={14} />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.navigationTargets.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summarySearch}`}>
            <div className={styles.summaryCardHeader}>
              <span className={styles.summaryCardTitle}>Search Matches</span>
              <span className={styles.summaryCardIcon}>
                <Icons.Search size={14} />
              </span>
            </div>
            <strong className={styles.summaryCardValue}>{report.search.matchCount}</strong>
          </div>
        </section>

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
            <>
              <div className={styles.sectionHeader}>
                <h3>Tokens</h3>
                <span>
                  {filteredTokens.length === report.tokens.length
                    ? `${report.tokens.length} highlighted spans`
                    : `Showing ${filteredTokens.length} of ${report.tokens.length} spans`}
                </span>
              </div>

              <div className={styles.toolbar}>
                <div className={styles.searchWrapper}>
                  <span className={styles.searchIcon}>
                    <Icons.Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Filter tokens by value, label, or type..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Filter tokens"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      className={styles.clearButton}
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear filter text"
                    >
                      <Icons.Close />
                    </button>
                  )}
                </div>

                {presentTypes.length > 2 && (
                  <div className={styles.filterPills}>
                    <span className={styles.filterLabel}>Type:</span>
                    {presentTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`${styles.filterPill} ${typeFilter === type ? styles.filterPillActive : ''}`}
                        onClick={() => setTypeFilter(type)}
                      >
                        {type === 'All' ? 'All Types' : getTokenLabel(type)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Line</th>
                      <th>Col</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.length > 0 ? (
                      filteredTokens.map((token) => (
                        <tr key={`${token.index}-${token.type}-${token.value}`}>
                          <td>{token.index}</td>
                          <td>{getTokenLabel(token.type)}</td>
                          <td>
                            <span className={`${styles.tokenPill} ${getTokenTone(token.type)}`}>
                              {token.type}
                            </span>
                          </td>
                          <td>{token.range?.startPosition?.line || '-'}</td>
                          <td>{token.range?.startPosition?.column || '-'}</td>
                          <td className={styles.valueCell}>
                            <code className={styles.valueCode}>{previewValue(token.value)}</code>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className={styles.emptyState}>
                          No tokens match your search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeSection === 'folds' && (
            <>
              <div className={styles.sectionHeader}>
                <h3>Folds</h3>
                <span>{report.foldLabel}</span>
              </div>
              {report.folds.length > 0 ? (
                <ul className={styles.detailList}>
                  {report.folds.map((fold) => (
                    <li key={fold.id}>
                      <code>{fold.id}</code>
                      <span>
                        {report.foldLabel}: {fold.startLine}-{fold.endLine}
                        {collapsedFoldIds.includes(fold.id) ? ' collapsed' : ''}
                        {fold.placeholder ? ` ${fold.placeholder}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No folds detected.</p>
              )}
            </>
          )}

          {activeSection === 'navigation' && (
            <>
              <div className={styles.sectionHeader}>
                <h3>Navigation Targets</h3>
                <span>{report.navigationLinksEnabled ? 'enabled' : 'disabled'}</span>
              </div>
              {report.navigationTargets.length > 0 ? (
                <ul className={styles.detailList}>
                  {report.navigationTargets.map((target, index) => (
                    <li key={`${target.start}-${target.end}-${target.name || index}`}>
                      <code>{target.type || 'target'}</code>
                      <span>
                        {target.name || target.text || 'unnamed'} at {target.position?.line || '-'}:
                        {target.position?.column || '-'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No navigation targets detected.</p>
              )}
            </>
          )}

          {activeSection === 'json' && (
            <>
              <div className={styles.sectionHeader}>
                <h3>Raw JSON</h3>
                <span>full report</span>
              </div>
              <pre className={styles.jsonBlock}>{JSON.stringify(report, null, 2)}</pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
