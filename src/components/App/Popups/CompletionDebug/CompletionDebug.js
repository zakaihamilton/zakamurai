import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import { createPortal } from 'react-dom';
import styles from './CompletionDebug.module.css';

const EMPTY_DEBUG = {
  status: 'idle',
  filePath: '',
  prompt: '',
  rawResult: '',
  completion: '',
  error: '',
};

const formatDebugPayload = (debug) =>
  [
    `Status: ${debug.status || 'idle'}`,
    `File: ${debug.filePath || '(none)'}`,
    debug.cursor
      ? `Cursor: line ${debug.cursor.line}, col ${debug.cursor.col}, index ${debug.cursor.index}`
      : '',
    debug.requestedAt ? `Requested: ${debug.requestedAt}` : '',
    debug.completedAt ? `Completed: ${debug.completedAt}` : '',
    '',
    'Prompt:',
    debug.prompt || '(empty)',
    '',
    'Raw AI result:',
    debug.rawResult || '(empty)',
    '',
    'Normalized completion:',
    debug.completion || '(empty)',
    '',
    'Error:',
    debug.error || '(none)',
  ]
    .filter((line) => line !== '')
    .join('\n');

export default function CompletionDebug({ isOpen, onClose }) {
  const editorState = EditorState.useState();
  const debug = editorState.aiCompletionDebug || EMPTY_DEBUG;
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const payload = formatDebugPayload(debug);

  const handleCopy = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return createPortal(
    <div className={styles.wrapper}>
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Close" />
      <dialog className={styles.modal} open>
        <header className={styles.header}>
          <div>
            <h2>AI Completion Debug</h2>
            <span className={styles.status}>{debug.status || 'idle'}</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.copyBtn} onClick={handleCopy}>
              <Icons.Copy />
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <Icons.Close />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.meta}>
            <span>{debug.filePath || 'No completion captured yet'}</span>
            {debug.cursor && (
              <span>
                Ln {debug.cursor.line}, Col {debug.cursor.col}
              </span>
            )}
          </div>

          <label className={styles.block}>
            <span>Prompt / Thinking Context</span>
            <textarea readOnly value={debug.prompt || ''} />
          </label>

          <label className={styles.block}>
            <span>Raw AI Result</span>
            <textarea readOnly value={debug.rawResult || ''} />
          </label>

          <label className={styles.block}>
            <span>Normalized Completion</span>
            <textarea readOnly value={debug.completion || ''} />
          </label>

          {debug.error && (
            <label className={styles.block}>
              <span>Error</span>
              <textarea readOnly value={debug.error} />
            </label>
          )}
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
