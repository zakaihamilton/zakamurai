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

  beforeEach(() => {
    vi.clearAllMocks();
    handleChange = vi.fn();
    textareaRef = createMockTextareaRef();
  });

  it('adds a closing bracket when typing "("', () => {
    textareaRef.current!.value = '';
    textareaRef.current!.selectionStart = 0;
    textareaRef.current!.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: '(' });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '()' } });
  });

  it('indents with Tab', () => {
    textareaRef.current!.value = 'line1';
    textareaRef.current!.selectionStart = 0;
    textareaRef.current!.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: 'Tab', shiftKey: false });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '  line1' } });
  });

  it('toggles comment with Cmd+/', () => {
    textareaRef.current!.value = 'const x = 1;';
    textareaRef.current!.selectionStart = 0;
    textareaRef.current!.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = createKeyboardEvent({ key: '/', metaKey: true });

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '// const x = 1;' } });
  });

  it('auto-indents on Enter after {', () => {
    textareaRef.current!.value = 'if (true) {';
    textareaRef.current!.selectionStart = 11;
    textareaRef.current!.selectionEnd = 11;

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
