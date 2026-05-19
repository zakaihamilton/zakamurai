import { findDefiningCssFiles, findReferencingJsFiles, getStyleAtCursor } from '@/utils/navigation';
import { isMac } from '@/utils/os';
import React, { useLayoutEffect, useRef, useCallback, useState } from 'react';
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
  onNavigateToAssociated,
  fileContents,
  onJumpToTarget,
}) {
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const showTimeoutRef = useRef(null);
  const pendingClassNameRef = useRef(null);
  const lastReportedIndex = useRef(-1);
  const isLocalEdit = useRef(false);

  const [popup, setPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    className: '',
    targets: [],
    isCss: false,
  });

  const hideTimeoutRef = useRef(null);
  const isHoveringPopupRef = useRef(false);

  const hidePopup = useCallback(() => {
    if (isHoveringPopupRef.current) return;
    setPopup((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const startHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(hidePopup, 300);
  }, [hidePopup]);

  const cancelHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const cancelShowTimer = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filePath reset is required to reset popup on tab switches
  useLayoutEffect(() => {
    setPopup({
      visible: false,
      x: 0,
      y: 0,
      className: '',
      targets: [],
      isCss: false,
    });
    pendingClassNameRef.current = null;
    cancelShowTimer();
    cancelHideTimer();
  }, [filePath, cancelShowTimer, cancelHideTimer]);

  const handleMouseMove = useCallback(
    (e) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { clientX, clientY } = e;

      // Pointer-events toggle hack!
      const pre = preRef.current;
      textarea.style.pointerEvents = 'none';
      if (pre) pre.style.pointerEvents = 'auto';

      const element = document.elementFromPoint(clientX, clientY);

      let range;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
      } else if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(clientX, clientY);
        if (position) {
          range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.setEnd(position.offsetNode, position.offset);
        }
      }

      // Restore pointer events
      textarea.style.pointerEvents = '';
      if (pre) pre.style.pointerEvents = '';

      if (!element) {
        pendingClassNameRef.current = null;
        cancelShowTimer();
        startHideTimer();
        return;
      }

      const preElement = element.closest('pre');
      if (!preElement) {
        pendingClassNameRef.current = null;
        cancelShowTimer();
        startHideTimer();
        return;
      }

      if (!range) {
        pendingClassNameRef.current = null;
        cancelShowTimer();
        startHideTimer();
        return;
      }

      const textNode = range.startContainer;
      const offset = range.startOffset;

      if (textNode.nodeType !== 3) {
        pendingClassNameRef.current = null;
        cancelShowTimer();
        startHideTimer();
        return;
      }

      let index = 0;
      const walker = document.createTreeWalker(preElement, 4);
      let currentNode = walker.nextNode();
      while (currentNode && currentNode !== textNode) {
        index += currentNode.textContent.length;
        currentNode = walker.nextNode();
      }
      index += offset;

      const isCss = filePath?.endsWith('.css');
      const styleResult = getStyleAtCursor(localContent, index, isCss);

      if (styleResult) {
        const className = typeof styleResult === 'string' ? styleResult : styleResult.className;
        const identifier = typeof styleResult === 'object' ? styleResult.identifier : null;

        // If the popup is already showing this class, just cancel the hide timer
        if (popup.visible && popup.className === className) {
          cancelHideTimer();
          return;
        }

        // If the popup is visible but showing a different class, close it immediately!
        if (popup.visible && popup.className !== className) {
          setPopup((prev) => ({ ...prev, visible: false }));
        }

        // If a show timer is already running for the exact same class, just preserve it
        if (showTimeoutRef.current && pendingClassNameRef.current === className) {
          cancelHideTimer();
          return;
        }

        const allFileContents = fileContents || {};
        let targets = [];
        if (isCss) {
          targets = findReferencingJsFiles(filePath, className, allFileContents);
        } else {
          targets = findDefiningCssFiles(filePath, className, identifier, allFileContents);
        }

        if (targets.length > 0) {
          cancelHideTimer();
          cancelShowTimer();

          pendingClassNameRef.current = className;
          const rect = textarea.getBoundingClientRect();
          const popupX = clientX - rect.left + 10;
          const popupY = clientY - rect.top + 15;

          showTimeoutRef.current = setTimeout(() => {
            setPopup({
              visible: true,
              x: popupX,
              y: popupY,
              className,
              targets,
              isCss,
            });
            showTimeoutRef.current = null;
            pendingClassNameRef.current = null;
          }, 500);
          return;
        }
      }

      pendingClassNameRef.current = null;
      cancelShowTimer();
      startHideTimer();
    },
    [
      localContent,
      filePath,
      fileContents,
      popup.visible,
      popup.className,
      startHideTimer,
      cancelHideTimer,
      cancelShowTimer,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    pendingClassNameRef.current = null;
    cancelShowTimer();
    startHideTimer();
  }, [cancelShowTimer, startHideTimer]);

  const handleSelectionChange = useCallback(
    (e) => {
      // Close hover popup immediately when user moves the text cursor or interacts with the editor
      setPopup((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      cancelShowTimer();
      cancelHideTimer();

      if (!onCursorUpdate) return;
      const textarea = e.target;
      const start = textarea.selectionStart;

      lastReportedIndex.current = start;
      onCursorUpdate(getCursorPosition(localContent, start));
    },
    [onCursorUpdate, localContent, cancelShowTimer, cancelHideTimer],
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

  useLayoutEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: localContent is required to catch browser cursor resets after sync
  useLayoutEffect(() => {
    if (textareaRef.current && cursorPos?.index !== undefined) {
      const textarea = textareaRef.current;
      const externalMove = cursorPos.index !== lastReportedIndex.current;

      // If this is a local edit, the correct selection index is lastReportedIndex.current.
      // Otherwise, the correct selection index is the external cursorPos.index.
      const browserReset = isLocalEdit.current
        ? textarea.selectionStart !== lastReportedIndex.current
        : textarea.selectionStart !== cursorPos.index;

      if (externalMove || browserReset) {
        const targetIndex = isLocalEdit.current ? lastReportedIndex.current : cursorPos.index;
        textarea.selectionStart = targetIndex;
        textarea.selectionEnd = targetIndex;
        lastReportedIndex.current = targetIndex;
      }
    }
    isLocalEdit.current = false;
  }, [cursorPos?.index, localContent]);

  return (
    <div
      className={styles.editorWrapper}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={readOnly ? undefined : localHandleChange}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        onKeyUp={handleSelectionChange}
        onBlur={handleSelectionChange}
        onClick={handleSelectionChange}
        onSelect={handleSelectionChange}
        onFocus={handleSelectionChange}
        readOnly={readOnly}
        spellCheck="false"
        className={styles.textarea}
      />

      <pre
        ref={preRef}
        aria-hidden="true"
        className={styles.pre}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: used for code syntax highlighting
        dangerouslySetInnerHTML={{
          __html: highlightedCode + (localContent.endsWith('\n') ? ' ' : ''),
        }}
      />

      {popup.visible && (
        <div
          className={styles.hoverPopup}
          style={{ left: popup.x, top: popup.y }}
          onMouseEnter={() => {
            isHoveringPopupRef.current = true;
            cancelHideTimer();
          }}
          onMouseLeave={() => {
            isHoveringPopupRef.current = false;
            startHideTimer();
          }}
        >
          <div className={styles.popupHeader}>
            {popup.isCss ? 'Referenced in JS' : 'Defined in CSS'}
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
