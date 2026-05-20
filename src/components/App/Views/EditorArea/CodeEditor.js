import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { findNavigationTargets } from '@/utils/navigation';
import { isMac } from '@/utils/os';
import React, { useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react';
import styles from './EditorArea.module.css';

import useEditorShortcuts from './EditorShortcuts';

const getCursorPosition = (content, index) => {
  let line = 1;
  let lineStart = 0;
  if (!content) return { line: 1, col: 1, index: 0 };

  for (let cursor = 0; cursor < index; cursor++) {
    if (content.charCodeAt(cursor) === 10) {
      line++;
      lineStart = cursor + 1;
    }
  }

  return { line, col: index - lineStart + 1, index };
};

export default function CodeEditor({
  localContent,
  handleChange,
  highlightedCode,
  readOnly,
  onCursorUpdate,
  cursorPos,
  scrollContainerRef,
  suggestion,
  onAcceptSuggestion,
  onCancelSuggestion,
  filePath,
  isReadOnly,
  onNavigateToAssociated,
  fileContents,
  onJumpToTarget,
}) {
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const lastReportedIndex = useRef(-1);
  const isLocalEdit = useRef(false);

  const [popup, setPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    className: '',
    targets: [],
    isCss: false,
    isImport: false,
    isExport: false,
  });

  const targets = useMemo(() => {
    const isCss = filePath?.endsWith('.css');
    return findNavigationTargets(localContent, isCss, fileContents, filePath);
  }, [localContent, filePath, fileContents]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filePath reset is required to reset popup on tab switches
  useLayoutEffect(() => {
    setPopup({
      visible: false,
      x: 0,
      y: 0,
      className: '',
      targets: [],
      isCss: false,
      isImport: false,
      isExport: false,
    });
    lastReportedIndex.current = -1;
  }, [filePath]);

  const handleSelectionChange = useCallback(
    (e) => {
      const textarea = e.target;
      const start = textarea.selectionStart;

      lastReportedIndex.current = start;
      if (onCursorUpdate) {
        onCursorUpdate(getCursorPosition(localContent, start));
      }
    },
    [onCursorUpdate, localContent],
  );

  const localHandleChange = useCallback(
    (e) => {
      isLocalEdit.current = true;
      handleChange?.(e);
      handleSelectionChange(e);
    },
    [handleChange, handleSelectionChange],
  );

  const { handleKeyDown } = useEditorShortcuts({
    handleChange: localHandleChange,
    textareaRef,
    scrollContainerRef,
    suggestion,
    onAcceptSuggestion,
    onCancelSuggestion,
    filePath,
    onNavigateToAssociated,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: localContent is required to catch browser cursor resets after sync
  useLayoutEffect(() => {
    if (textareaRef.current && cursorPos?.index !== undefined) {
      const textarea = textareaRef.current;
      const externalMove = cursorPos.index !== lastReportedIndex.current;

      const browserReset = isLocalEdit.current
        ? textarea.selectionStart !== lastReportedIndex.current
        : textarea.selectionStart !== cursorPos.index;

      if (externalMove || browserReset) {
        const targetIndex = isLocalEdit.current ? lastReportedIndex.current : cursorPos.index;
        textarea.selectionStart = targetIndex;
        textarea.selectionEnd = targetIndex;
        lastReportedIndex.current = targetIndex;
        if (externalMove) {
          textarea.focus();
        }
      }
    }
    isLocalEdit.current = false;
  }, [cursorPos?.index, localContent]);

  const isCssFile = filePath?.endsWith('.css');

  const handlePreClick = useCallback(
    (e) => {
      if (!isReadOnly) return;

      const link = e.target.closest('[data-nav-target]');
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      const targetIdxAttr = link.getAttribute('data-nav-idx');
      if (targetIdxAttr === null) return;

      const targetIdx = Number(targetIdxAttr);
      const target = targets[targetIdx];
      if (!target) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      const rect = link.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      const x = rect.left - textareaRect.left;
      const y = rect.top - textareaRect.top + rect.height / 2;

      const className = target.type === 'import'
        ? `import:${target.name}`
        : target.type === 'export'
        ? `export:${target.name}`
        : target.className;

      setPopup((prev) => {
        if (prev.visible && prev.className === className) {
          return { ...prev, visible: false };
        }
        return {
          visible: true,
          x,
          y: y + 10,
          className,
          targets: target.targets,
          isCss: isCssFile,
          isImport: target.type === 'import',
          isExport: target.type === 'export',
        };
      });
    },
    [isReadOnly, targets, isCssFile],
  );

  return (
    <div className={styles.editorWrapper}>
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={readOnly || isReadOnly ? undefined : localHandleChange}
        onKeyDown={readOnly || isReadOnly ? undefined : handleKeyDown}
        onKeyUp={handleSelectionChange}
        onBlur={handleSelectionChange}
        onClick={handleSelectionChange}
        onSelect={handleSelectionChange}
        onFocus={handleSelectionChange}
        readOnly={readOnly || isReadOnly}
        spellCheck="false"
        className={`${styles.textarea} ${isReadOnly ? styles.readOnlyTextarea : ''}`}
      />

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is sufficient for navigation in this read-only pre element */}
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`${styles.pre} ${isReadOnly ? styles.readOnlyPre : ''}`}
        onClick={handlePreClick}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: used for code syntax highlighting
        dangerouslySetInnerHTML={{
          __html: highlightedCode + (localContent.endsWith('\n') ? ' ' : ''),
        }}
      />

      {popup.visible && (
        <div className={styles.hoverPopup} style={{ left: `${popup.x}px`, top: `${popup.y}px` }}>
          <div className={styles.popupHeader}>
            <span>
              {popup.isImport
                ? 'Open Import'
                : popup.isExport
                ? 'Referenced in'
                : popup.isCss
                ? 'Referenced in JS'
                : 'Defined in CSS'}
            </span>
            <Tooltip content="Close">
              <button
                type="button"
                className={styles.popupCloseBtn}
                onClick={() => {
                  setPopup((prev) => ({ ...prev, visible: false }));
                }}
                aria-label="Close popup"
              >
                &times;
              </button>
            </Tooltip>
          </div>
          <ul className={styles.popupList}>
            {popup.targets.map((target) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: onClick is sufficient for navigation in this popover
              <li
                key={target.filePath}
                className={styles.popupItem}
                onClick={() => {
                  onJumpToTarget?.(target.filePath, target.loc);
                  setPopup((prev) => ({ ...prev, visible: false }));
                }}
              >
                <span>{target.fileName}</span>
                <span style={{ opacity: 0.6, fontSize: '11px' }}>:{target.loc.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
