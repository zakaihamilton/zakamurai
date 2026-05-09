import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from './EditorArea.module.css';

export default function FindReplaceBar({
  showFind,
  setShowFind,
  findQuery,
  setFindQuery,
  replaceQuery,
  setReplaceQuery,
  matches,
  matchIndex,
  setMatchIndex,
  handleFind,
  handleReplace,
  handleReplaceAll,
}) {
  if (!showFind) return null;

  return (
    <div className={styles.findBar}>
      <div className={styles.findRow}>
        <input
          // biome-ignore lint/a11y/noAutofocus: autofocus is desirable for find bar
          autoFocus
          placeholder="Find..."
          value={findQuery}
          onChange={(e) => setFindQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFind()}
          className={styles.findInput}
        />
        <div className={styles.findStats}>
          {matches.length > 0 ? `${matchIndex + 1} / ${matches.length}` : 'No results'}
        </div>
        <button
          type="button"
          onClick={() => setMatchIndex((i) => (matches.length > 0 ? (i + 1) % matches.length : -1))}
          className={styles.findBtn}
        >
          <Icons.ChevronDown />
        </button>
        <button
          type="button"
          onClick={() =>
            setMatchIndex((i) =>
              matches.length > 0 ? (i - 1 + matches.length) % matches.length : -1,
            )
          }
          className={styles.findBtn}
        >
          <Icons.ChevronUp />
        </button>
        <button type="button" onClick={() => setShowFind(false)} className={styles.findBtn}>
          <Icons.Close />
        </button>
      </div>
      <div className={styles.findRow}>
        <input
          placeholder="Replace with..."
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          className={styles.findInput}
        />
        <button type="button" onClick={handleReplace} className={styles.replaceBtn}>
          Replace
        </button>
        <button type="button" onClick={handleReplaceAll} className={styles.replaceBtn}>
          All
        </button>
      </div>
    </div>
  );
}
