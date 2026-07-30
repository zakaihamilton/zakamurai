import type { CursorPosition } from '@/components/state/domain-types';
import Dialog from '@/components/ui/Dialog';
import { findNavigationTargets } from '@/utils/navigation';
import type React from 'react';
import { type ChangeEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './CodeEditor.module.css';

import useEditorShortcuts from './EditorShortcuts';
import NavigationPopup from './NavigationPopup';
import { shouldDeferEditorAnalysis } from './largeFile';
import type {
  CodeEditorProps,
  EditorShortcutsProps,
  NavigationPopupState,
  TextareaRef,
} from './types';
import useScrollSync from './useScrollSync';

const getCursorPosition = (content: string, index: number): CursorPosition => {
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
  isCompleting = false,
  filePath,
  isReadOnly = false,
  onCopySelection,
  navigationLinksEnabled = isReadOnly,
  onNavigateToAssociated,
  fileContents,
  onJumpToTarget,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null) as TextareaRef;
  const preRef = useRef<HTMLPreElement>(null);
  const lastReportedIndex = useRef(-1);
  const isLocalEdit = useRef(false);

  const [popup, setPopup] = useState<NavigationPopupState>({
    visible: false,
    x: 0,
    y: 0,
    className: '',
    targets: [],
    isCss: false,
    isImport: false,
    isExport: false,
    isComponent: false,
  });
  const [isJumpToLineOpen, setIsJumpToLineOpen] = useState(false);
  const [jumpToLineValue, setJumpToLineValue] = useState('');

  const targets = useMemo(() => {
    if (shouldDeferEditorAnalysis(localContent)) return [];
    const isCss = filePath?.endsWith('.css') ?? false;
    return findNavigationTargets(localContent, isCss, fileContents || {}, filePath || '');
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
      isComponent: false,
    });
    lastReportedIndex.current = -1;
  }, [filePath]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textareaRef is a stable ref object
  const handleSelectionChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement> | React.SyntheticEvent<HTMLTextAreaElement>) => {
      // Editor shortcuts synthesize a minimal change event, which has a target value
      // but no currentTarget. Use the mounted textarea for its actual selection.
      const textarea = e.currentTarget ?? textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;

      lastReportedIndex.current = start;
      if (onCursorUpdate) {
        onCursorUpdate(getCursorPosition(localContent, start));
      }
    },
    [onCursorUpdate, localContent],
  );

  const localHandleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      isLocalEdit.current = true;
      handleChange?.(e);
      handleSelectionChange(e);
    },
    [handleChange, handleSelectionChange],
  );

  const handleCopy = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onCopySelection) return;

      const textarea = e.currentTarget;
      const text = onCopySelection(textarea.value, textarea.selectionStart, textarea.selectionEnd);
      if (!text) return;

      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
    },
    [onCopySelection],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: textareaRef is a stable ref object
  const handleJumpToLine = useCallback(() => {
    const lineNum = Number.parseInt(jumpToLineValue, 10);
    const textarea = textareaRef.current;
    if (!textarea || Number.isNaN(lineNum) || lineNum <= 0) return;

    const lines = textarea.value.split('\n');
    const targetLine = Math.min(lineNum, lines.length);
    const index = lines
      .slice(0, targetLine - 1)
      .reduce((total, line) => total + line.length + 1, 0);
    textarea.selectionStart = textarea.selectionEnd = index;
    textarea.focus();
    const lineHeight = 1.6 * 14;
    scrollContainerRef?.current?.scrollTo({
      top: (targetLine - 1) * lineHeight + 20 - 100,
      behavior: 'smooth',
    });
    setIsJumpToLineOpen(false);
    setJumpToLineValue('');
  }, [jumpToLineValue, scrollContainerRef]);

  const { handleKeyDown } = useEditorShortcuts({
    handleChange: localHandleChange as EditorShortcutsProps['handleChange'],
    textareaRef,
    scrollContainerRef,
    suggestion,
    isCompleting,
    onAcceptSuggestion,
    onCancelSuggestion,
    filePath,
    onNavigateToAssociated,
    onRequestJumpToLine: () => setIsJumpToLineOpen(true),
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

  const [, setViewportWidth] = useState(0);

  useLayoutEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const updateWidth = () => {
      setViewportWidth(container.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [scrollContainerRef]);

  useScrollSync(scrollContainerRef, textareaRef, localContent);

  const isCssFile = filePath?.endsWith('.css') ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: textareaRef is a stable ref object
  const handlePreClick = useCallback(
    (e: React.MouseEvent<HTMLPreElement>) => {
      if (!isReadOnly && !navigationLinksEnabled) return;

      const link = (e.target as HTMLElement).closest('[data-nav-target]');
      if (!link) return;
      if (!isReadOnly && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const targetIdxAttr = link.getAttribute('data-nav-idx');
      if (targetIdxAttr === null) return;

      const targetIdx = Number(targetIdxAttr);
      const target = targets[targetIdx];
      if (!target) return;

      if (target.targets && target.targets.length === 1) {
        const singleTarget = target.targets[0];
        onJumpToTarget?.(singleTarget.filePath, singleTarget.loc);
        setPopup((prev) => ({ ...prev, visible: false }));
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea) return;

      const rect = link.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      const x = rect.left - textareaRect.left;
      const y = rect.top - textareaRect.top + rect.height / 2;

      const className =
        target.type === 'import'
          ? `import:${target.name}`
          : target.type === 'export'
            ? `export:${target.name}`
            : target.type === 'component'
              ? `component:${target.name}`
              : target.className || '';

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
          isComponent: target.type === 'component',
        };
      });
    },
    [isReadOnly, navigationLinksEnabled, targets, isCssFile, onJumpToTarget],
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
        onCopy={handleCopy}
        readOnly={readOnly || isReadOnly}
        spellCheck="false"
        wrap="off"
        aria-label={filePath ? `Code editor: ${filePath}` : 'Code editor'}
        className={`${styles.textarea} ${isReadOnly || readOnly ? styles.readOnlyTextarea : ''} ${
          !isReadOnly && !readOnly && navigationLinksEnabled ? styles.navigationLinksTextarea : ''
        }`}
      />

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is sufficient for navigation in this read-only pre element */}
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`${styles.pre} ${isReadOnly || readOnly || navigationLinksEnabled ? styles.readOnlyPre : ''}`}
        onClick={handlePreClick}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: used for code syntax highlighting
        dangerouslySetInnerHTML={{
          __html: highlightedCode + (localContent.endsWith('\n') ? ' ' : ''),
        }}
      />

      <NavigationPopup
        popup={popup}
        onClose={() => setPopup((prev) => ({ ...prev, visible: false }))}
        onJumpToTarget={onJumpToTarget}
      />
      <Dialog
        isOpen={isJumpToLineOpen}
        title="Go to line"
        confirmText="Go"
        onConfirm={handleJumpToLine}
        onCancel={() => {
          setIsJumpToLineOpen(false);
          setJumpToLineValue('');
        }}
      >
        <input
          aria-label="Line number"
          inputMode="numeric"
          value={jumpToLineValue}
          onChange={(event) => setJumpToLineValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleJumpToLine();
          }}
        />
      </Dialog>
    </div>
  );
}
