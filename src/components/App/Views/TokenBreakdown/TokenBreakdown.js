import { EditorState } from '@/components/App/Views/EditorArea';
import { getCssBlockFolds, isCssPath } from '@/components/App/Views/EditorArea/CssFolding';
import editorStyles from '@/components/App/Views/EditorArea/EditorArea.module.css';
import {
  getJavaScriptBlockFolds,
  isJavaScriptPath,
} from '@/components/App/Views/EditorArea/JavaScriptFolding';
import { getJsonObjectFolds, isJsonPath } from '@/components/App/Views/EditorArea/JsonFolding';
import { getHighlightBreakdown } from '@/components/App/Views/EditorArea/highlighter';
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
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
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState('tokens');
  const filePath = tab?.sourceFilePath || tab?.filePath || '';
  const code = editorState.fileContents?.[filePath] ?? tab?.content ?? '';
  const collapsedFoldIds = tab?.collapsedFoldIds || [];

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

  if (!filePath) {
    return (
      <div className={styles.breakdownView}>
        <div className={styles.emptyState}>No source file is attached to this token breakdown.</div>
      </div>
    );
  }

  return (
    <div className={styles.breakdownView}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.titleIcon}>
              <Icons.Code size={17} />
            </div>
            <div>
              <h2>Token Breakdown</h2>
              <p>{filePath}</p>
            </div>
          </div>
          <Tooltip content={copied ? 'Copied!' : 'Copy token breakdown'}>
            <button
              type="button"
              className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
              onClick={handleCopy}
              aria-live="polite"
            >
              {copied ? <Icons.Check /> : <Icons.Copy />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </Tooltip>
        </header>

        <section className={styles.summaryGrid} aria-label="Token breakdown summary">
          <div className={`${styles.summaryCard} ${styles.summaryMode}`}>
            <span>Mode</span>
            <strong>{report.languageMode}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryTokens}`}>
            <span>Tokens</span>
            <strong>{report.tokens.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryLines}`}>
            <span>Lines</span>
            <strong>{report.lineCount}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryFolds}`}>
            <span>Folds</span>
            <strong>{report.folds.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryNav}`}>
            <span>Nav Targets</span>
            <strong>{report.navigationTargets.length}</strong>
          </div>
          <div className={`${styles.summaryCard} ${styles.summarySearch}`}>
            <span>Search Matches</span>
            <strong>{report.search.matchCount}</strong>
          </div>
        </section>

        {report.largeFileFallback && (
          <div className={styles.notice}>
            This file is above the highlighter limit and is rendered as escaped plain text.
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

        {activeSection === 'tokens' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Tokens</h3>
              <span>{report.tokens.length} highlighted spans</span>
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
                  {report.tokens.length > 0 ? (
                    report.tokens.map((token) => (
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
                        <td>
                          <code>{previewValue(token.value)}</code>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>No tokens were produced.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === 'folds' && (
          <section className={styles.section}>
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
          </section>
        )}

        {activeSection === 'navigation' && (
          <section className={styles.section}>
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
          </section>
        )}

        {activeSection === 'json' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Raw JSON</h3>
              <span>full report</span>
            </div>
            <pre className={styles.jsonBlock}>{JSON.stringify(report, null, 2)}</pre>
          </section>
        )}
      </div>
    </div>
  );
}
