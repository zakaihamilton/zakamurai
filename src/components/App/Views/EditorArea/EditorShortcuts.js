import { formatCode } from '@/utils/formatter';
import { isMac } from '@/utils/os';
import { useCallback } from 'react';

export default function useEditorShortcuts({
  handleChange,
  textareaRef,
  scrollContainerRef,
  suggestion,
  onAcceptSuggestion,
  onCancelSuggestion,
  filePath,
}) {
  const handleKeyDown = useCallback(
    (e) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      const mac = isMac();
      const cmdKey = mac ? e.metaKey : e.ctrlKey;

      if (e.key === 'Escape' && suggestion) {
        e.preventDefault();
        onCancelSuggestion?.({ pauseUntilEdit: true });
        return;
      }

      // 0. Jump to Line (Ctrl+G)
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        const lineStr = window.prompt('Enter line number:');
        const lineNum = Number.parseInt(lineStr, 10);
        if (!Number.isNaN(lineNum) && lineNum > 0) {
          const lines = value.split('\n');
          const targetLine = Math.min(lineNum, lines.length);
          let index = 0;
          for (let i = 0; i < targetLine - 1; i++) {
            index += lines[i].length + 1;
          }

          textarea.selectionStart = textarea.selectionEnd = index;
          textarea.focus();

          // Scroll to line
          if (scrollContainerRef?.current) {
            const lineHeight = 1.6 * 14; // Match FindHandler's approximation
            const top = (targetLine - 1) * lineHeight + 20;
            scrollContainerRef.current.scrollTo({
              top: top - 100,
              behavior: 'smooth',
            });
          }
        }
        return;
      }

      // 1. Tab Indentation or Accept Suggestion
      if (e.key === 'Tab') {
        if (suggestion) {
          e.preventDefault();
          onAcceptSuggestion(suggestion);
          return;
        }

        e.preventDefault();
        if (e.shiftKey) {
          // Outdent
          const lines = value.split('\n');
          const startLine = value.substring(0, selectionStart).split('\n').length - 1;
          const endLine = value.substring(0, selectionEnd).split('\n').length - 1;

          let totalRemoved = 0;
          let firstLineRemoved = 0;

          for (let i = startLine; i <= endLine; i++) {
            if (lines[i].startsWith('  ')) {
              lines[i] = lines[i].substring(2);
              totalRemoved += 2;
              if (i === startLine) firstLineRemoved = 2;
            } else if (lines[i].startsWith(' ')) {
              lines[i] = lines[i].substring(1);
              totalRemoved += 1;
              if (i === startLine) firstLineRemoved = 1;
            }
          }

          const newValue = lines.join('\n');
          handleChange({ target: { value: newValue } });

          // Restore selection
          setTimeout(() => {
            textarea.selectionStart = Math.max(0, selectionStart - firstLineRemoved);
            textarea.selectionEnd = Math.max(0, selectionEnd - totalRemoved);
          }, 0);
        } else {
          // Indent
          if (selectionStart !== selectionEnd) {
            // Multi-line indent
            const lines = value.split('\n');
            const startLine = value.substring(0, selectionStart).split('\n').length - 1;
            const endLine = value.substring(0, selectionEnd).split('\n').length - 1;

            for (let i = startLine; i <= endLine; i++) {
              lines[i] = `  ${lines[i]}`;
            }

            const newValue = lines.join('\n');
            handleChange({ target: { value: newValue } });

            setTimeout(() => {
              textarea.selectionStart = selectionStart + 2;
              textarea.selectionEnd = selectionEnd + (endLine - startLine + 1) * 2;
            }, 0);
          } else {
            // Single line tab
            const newValue = `${value.substring(0, selectionStart)}  ${value.substring(selectionEnd)}`;
            handleChange({ target: { value: newValue } });
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
            }, 0);
          }
        }
      }

      // 2. Auto-closing Brackets/Quotes
      const pairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'",
        '`': '`',
      };

      if (pairs[e.key]) {
        e.preventDefault();
        const closing = pairs[e.key];
        const selection = value.substring(selectionStart, selectionEnd);
        const newValue =
          value.substring(0, selectionStart) +
          e.key +
          selection +
          closing +
          value.substring(selectionEnd);

        handleChange({ target: { value: newValue } });

        setTimeout(() => {
          if (selectionStart === selectionEnd) {
            textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
          } else {
            textarea.selectionStart = selectionStart + 1;
            textarea.selectionEnd = selectionEnd + 1;
          }
        }, 0);
      }

      // 3. Toggle Comments (Cmd+/)
      if (cmdKey && e.key === '/') {
        e.preventDefault();
        const lines = value.split('\n');
        const startLine = value.substring(0, selectionStart).split('\n').length - 1;
        const endLine = value.substring(0, selectionEnd).split('\n').length - 1;

        // Check if all lines are commented
        let allCommented = true;
        for (let i = startLine; i <= endLine; i++) {
          if (lines[i].trim() && !lines[i].trim().startsWith('//')) {
            allCommented = false;
            break;
          }
        }

        let deltaStart = 0;
        let deltaTotal = 0;

        for (let i = startLine; i <= endLine; i++) {
          if (allCommented) {
            // Uncomment
            if (lines[i].trim().startsWith('//')) {
              const match = lines[i].match(/^(\s*)\/\/\s?/);
              if (match) {
                const len = match[0].length;
                lines[i] = lines[i].replace(/^(\s*)\/\/\s?/, '$1');
                deltaTotal -= len;
                if (i === startLine) deltaStart -= len;
              }
            }
          } else {
            // Comment
            if (lines[i].trim() || i === startLine || i === endLine) {
              lines[i] = `// ${lines[i]}`;
              deltaTotal += 3;
              if (i === startLine) deltaStart += 3;
            }
          }
        }

        const newValue = lines.join('\n');
        handleChange({ target: { value: newValue } });

        setTimeout(() => {
          textarea.selectionStart = Math.max(0, selectionStart + deltaStart);
          textarea.selectionEnd = Math.max(0, selectionEnd + deltaTotal);
        }, 0);
      }

      // 4. Auto-indent on Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        const charBefore = value[selectionStart - 1];
        if (charBefore === '{' || charBefore === '[' || charBefore === '(') {
          e.preventDefault();
          const lineBefore = value.substring(0, selectionStart).split('\n').pop();
          const indent = lineBefore.match(/^\s*/)[0];
          const newIndent = `${indent}  `;

          const charAfter = value[selectionEnd];
          const isClosed =
            (charBefore === '{' && charAfter === '}') ||
            (charBefore === '[' && charAfter === ']') ||
            (charBefore === '(' && charAfter === ')');

          let newValue;
          let newCursorPos;

          if (isClosed) {
            newValue = `${value.substring(0, selectionStart)}\n${newIndent}\n${indent}${value.substring(selectionEnd)}`;
            newCursorPos = selectionStart + 1 + newIndent.length;
          } else {
            newValue = `${value.substring(0, selectionStart)}\n${newIndent}${value.substring(selectionEnd)}`;
            newCursorPos = selectionStart + 1 + newIndent.length;
          }

          handleChange({ target: { value: newValue } });
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = newCursorPos;
          }, 0);
        } else {
          // Normal enter but keep indentation
          const lineBefore = value.substring(0, selectionStart).split('\n').pop();
          const indent = lineBefore.match(/^\s*/)[0];
          if (indent) {
            e.preventDefault();
            const newValue = `${value.substring(0, selectionStart)}\n${indent}${value.substring(selectionEnd)}`;
            handleChange({ target: { value: newValue } });
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indent.length;
            }, 0);
          }
        }
      }

      // 5. Format Code (Control+Shift+F)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        const formatted = formatCode(value, filePath);
        if (formatted !== value) {
          handleChange({ target: { value: formatted } });
        }
      }
    },
    [
      handleChange,
      textareaRef,
      scrollContainerRef,
      suggestion,
      onAcceptSuggestion,
      onCancelSuggestion,
      filePath,
    ],
  );

  return { handleKeyDown };
}
