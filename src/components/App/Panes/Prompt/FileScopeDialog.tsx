import Dialog from '@/components/ui/Dialog';
import { useMemo } from 'react';
import styles from './FileScopeDialog.module.css';

type FileScopeDialogProps = {
  isOpen: boolean;
  files: string[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (filePath: string) => void;
  onCancel: () => void;
};

export default function FileScopeDialog({
  isOpen,
  files,
  query,
  onQueryChange,
  onSelect,
  onCancel,
}: FileScopeDialogProps) {
  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...new Set(files)]
      .filter((filePath) => !normalizedQuery || filePath.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b));
  }, [files, query]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Select a file for this prompt"
      onConfirm={onCancel}
      onCancel={onCancel}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
        </div>
      }
      className={styles.dialog}
    >
      <div className={styles.content}>
        <label className={styles.searchLabel} htmlFor="prompt-file-search">
          Search project files
        </label>
        <input
          id="prompt-file-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by file name or path"
          className={styles.searchInput}
        />
        {visibleFiles.length ? (
          <ul className={styles.fileList} aria-label="Project files">
            {visibleFiles.map((filePath) => (
              <li key={filePath}>
                <button
                  type="button"
                  className={styles.fileButton}
                  onClick={() => onSelect(filePath)}
                >
                  {filePath}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>No project files match your search.</p>
        )}
      </div>
    </Dialog>
  );
}
