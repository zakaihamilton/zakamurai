import type { TextareaRef } from '@/components/App/Views/EditorArea/types';
import { createKeyboardEvent, createMockTextareaRef } from '@/test-utils/editorMocks';
import { renderHook } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import useEditorShortcuts from './EditorShortcuts';

vi.mock('@/utils/os', () => ({
  isMac: vi.fn(() => true),
}));

describe('useEditorShortcuts', () => {
  let handleChange: Mock;
  let textareaRef: TextareaRef;

  const textarea = () => {
    const el = textareaRef.current;
    if (!el) throw new Error('expected textarea ref');
    return el;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handleChange = vi.fn();
    textareaRef = createMockTextareaRef();
  });

  it('adds a closing bracket when typing "("', () => {
    textarea().value = '';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: '(' });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '()' } });
  });

  it('indents with Tab', () => {
    textarea().value = 'line1';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: 'Tab', shiftKey: false });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '  line1' } });
  });

  it('toggles comment with Cmd+/', () => {
    textarea().value = 'const x = 1;';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: '/', metaKey: true });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '// const x = 1;' } });
  });

  it('auto-indents on Enter after {', () => {
    textarea().value = 'if (true) {';
    textarea().selectionStart = 11;
    textarea().selectionEnd = 11;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: 'Enter', shiftKey: false });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'if (true) {\n  ' } });
  });

  it('accepts AI suggestion with Tab', () => {
    const onAcceptSuggestion = vi.fn();
    const { result } = renderHook(() =>
      useEditorShortcuts({
        handleChange,
        textareaRef,
        suggestion: 'completion',
        onAcceptSuggestion,
      }),
    );

    const event = createKeyboardEvent({ key: 'Tab' });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onAcceptSuggestion).toHaveBeenCalledWith('completion');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('accepts the next word of an AI suggestion with Cmd+ArrowRight', () => {
    const onAcceptSuggestion = vi.fn();
    const { result } = renderHook(() =>
      useEditorShortcuts({
        handleChange,
        textareaRef,
        suggestion: 'foo bar',
        onAcceptSuggestion,
      }),
    );

    const event = createKeyboardEvent({
      key: 'ArrowRight',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onAcceptSuggestion).toHaveBeenCalledWith('foo ');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('stops in-flight completion when Escape is pressed during thinking', () => {
    const onCancelSuggestion = vi.fn();
    const { result } = renderHook(() =>
      useEditorShortcuts({
        handleChange,
        textareaRef,
        isCompleting: true,
        onCancelSuggestion,
      }),
    );

    const event = createKeyboardEvent({ key: 'Escape' });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCancelSuggestion).toHaveBeenCalledWith({ pauseUntilEdit: true });
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('cancels AI suggestion with Escape', () => {
    const onCancelSuggestion = vi.fn();
    const { result } = renderHook(() =>
      useEditorShortcuts({
        handleChange,
        textareaRef,
        suggestion: 'completion',
        onCancelSuggestion,
      }),
    );

    const event = createKeyboardEvent({ key: 'Escape' });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCancelSuggestion).toHaveBeenCalledWith({ pauseUntilEdit: true });
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('outdents with Shift+Tab', () => {
    textarea().value = '  line1\n  line2';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 14;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));
    const event = createKeyboardEvent({ key: 'Tab', shiftKey: true });

    result.current.handleKeyDown(event);

    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'line1\nline2' } });
  });

  it('indents a multi-line selection with Tab', () => {
    textarea().value = 'line1\nline2';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 11;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));
    const event = createKeyboardEvent({ key: 'Tab' });

    result.current.handleKeyDown(event);

    expect(handleChange).toHaveBeenCalledWith({ target: { value: '  line1\n  line2' } });
  });

  it('wraps selections in square brackets and quotes', () => {
    textarea().value = 'value';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 5;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    result.current.handleKeyDown(createKeyboardEvent({ key: '[' }));
    expect(handleChange).toHaveBeenLastCalledWith({ target: { value: '[value]' } });

    result.current.handleKeyDown(createKeyboardEvent({ key: '"' }));
    expect(handleChange).toHaveBeenLastCalledWith({ target: { value: '"value"' } });
  });

  it('requests jump-to-line on Ctrl+G', () => {
    const onRequestJumpToLine = vi.fn();
    const { result } = renderHook(() =>
      useEditorShortcuts({ handleChange, textareaRef, onRequestJumpToLine }),
    );

    result.current.handleKeyDown(createKeyboardEvent({ key: 'g', ctrlKey: true }));

    expect(onRequestJumpToLine).toHaveBeenCalled();
  });

  it('uncomments selected lines with Cmd+/', () => {
    textarea().value = '// const x = 1;';
    textarea().selectionStart = 0;
    textarea().selectionEnd = 15;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));
    result.current.handleKeyDown(createKeyboardEvent({ key: '/', metaKey: true }));

    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'const x = 1;' } });
  });

  it('auto-indents between matching braces on Enter', () => {
    textarea().value = 'if (true) {}';
    textarea().selectionStart = 11;
    textarea().selectionEnd = 11;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));
    result.current.handleKeyDown(createKeyboardEvent({ key: 'Enter' }));

    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'if (true) {\n  \n}' } });
  });

  it('preserves indentation on Enter for indented lines', () => {
    textarea().value = '  const x = 1;';
    textarea().selectionStart = 14;
    textarea().selectionEnd = 14;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));
    result.current.handleKeyDown(createKeyboardEvent({ key: 'Enter' }));

    expect(handleChange).toHaveBeenCalledWith({ target: { value: '  const x = 1;\n  ' } });
  });
});

vi.mock('@/utils/formatter', () => ({
  formatCode: vi.fn((code: string) => `formatted: ${code}`),
}));

describe('useEditorShortcuts formatting', () => {
  let handleChange: Mock;
  let textareaRef: TextareaRef;

  beforeEach(() => {
    vi.clearAllMocks();
    handleChange = vi.fn();
    textareaRef = createMockTextareaRef({ value: 'unformatted' });
  });

  it('formats code with Control+Shift+F', () => {
    const { result } = renderHook(() =>
      useEditorShortcuts({ handleChange, textareaRef, filePath: 'test.js' }),
    );

    const event = createKeyboardEvent({ key: 'f', ctrlKey: true, shiftKey: true });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'formatted: unformatted' } });
  });
});
