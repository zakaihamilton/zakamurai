import type { ModelSearchProps } from '../model-types';
import styles from './ModelSearch.module.css';

export default function ModelSearch({ searchTerm, onSearchTermChange }: ModelSearchProps) {
  return (
    <label className={styles.search}>
      <span className={styles.searchLabel}>Search models</span>
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Filter by name, requirement, or capability"
      />
    </label>
  );
}
