import { Icons } from '@/components/ui/Icons';
import React from 'react';

export default function ModelSearch({ searchTerm, onSearchTermChange, styles = {} }) {
  return (
    <div className={styles.modelSearch}>
      <Icons.Search size={14} />
      <input
        type="search"
        aria-label="Search AI models"
        placeholder="Search models, capabilities, or status..."
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
      />
      {searchTerm && (
        <button
          type="button"
          onClick={() => onSearchTermChange('')}
          aria-label="Clear model search"
        >
          <Icons.Close size={14} />
        </button>
      )}
    </div>
  );
}
