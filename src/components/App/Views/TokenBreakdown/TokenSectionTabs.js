import React from 'react';
import styles from './TokenSectionTabs.module.css';

export default function TokenSectionTabs({ activeSection, report, onSelect }) {
  const sections = [
    ['tokens', 'Tokens', report.tokens.length],
    ['folds', 'Folds', report.folds.length],
    ['navigation', 'Navigation', report.navigationTargets.length],
    ['json', 'Raw JSON', null],
  ];
  return (
    <nav className={styles.sectionTabs} aria-label="Token breakdown sections">
      {sections.map(([id, label, count]) => (
        <button
          key={id}
          type="button"
          className={`${styles.sectionTab} ${activeSection === id ? styles.sectionTabActive : ''}`}
          onClick={() => onSelect(id)}
          aria-pressed={activeSection === id}
        >
          <span>{label}</span>
          {count !== null && <strong>{count}</strong>}
        </button>
      ))}
    </nav>
  );
}
