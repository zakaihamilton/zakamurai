import { Icons } from '@/components/ui/Icons';
import type { TokenTableSectionProps } from './token-breakdown-types';
import styles from './TokenTableSection.module.css';
import { getTokenLabel } from './tokenUtils';

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

const previewValue = (value = '') => {
  const normalized = String(value).replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

export default function TokenTableSection({
  tokens,
  filteredTokens,
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  presentTypes,
}: TokenTableSectionProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h3>Tokens</h3>
        <span>
          {filteredTokens.length === tokens.length
            ? `${tokens.length} highlighted spans`
            : `Showing ${filteredTokens.length} of ${tokens.length} spans`}
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
          <colgroup>
            <col className={styles.colIndex} />
            <col className={styles.colName} />
            <col className={styles.colType} />
            <col className={styles.colLine} />
            <col className={styles.colCol} />
            <col className={styles.colValue} />
          </colgroup>
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
              filteredTokens.map((token, position) => (
                <tr key={`${token.index}-${token.type}-${token.value}`}>
                  <td>{position + 1}</td>
                  <td className={styles.nameCell}>{getTokenLabel(token.type)}</td>
                  <td className={styles.typeCell}>
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
  );
}
