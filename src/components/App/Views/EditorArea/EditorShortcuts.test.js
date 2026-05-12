import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useEditorShortcuts from './EditorShortcuts';

vi.mock('@/utils/os', () => ({
  isMac: vi.fn(() => true),
}));

describe('useEditorShortcuts', () => {
  let handleChange;
  let textareaRef;

  beforeEach(() => {
    vi.clearAllMocks();
    handleChange = vi.fn();
    textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        value: '',
        focus: vi.fn(),
        scrollTo: vi.fn(),
      },
    };
  });

  it('adds a closing bracket when typing "("', () => {
    const localContent = '';
    textareaRef.current.value = localContent;
    textareaRef.current.selectionStart = 0;
    textareaRef.current.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = {
      key: '(',
      preventDefault: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '()' } });
  });

  it('indents with Tab', () => {
    const localContent = 'line1';
    textareaRef.current.value = localContent;
    textareaRef.current.selectionStart = 0;
    textareaRef.current.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '  line1' } });
  });

  it('toggles comment with Cmd+/', () => {
    const localContent = 'const x = 1;';
    textareaRef.current.value = localContent;
    textareaRef.current.selectionStart = 0;
    textareaRef.current.selectionEnd = 0;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = {
      key: '/',
      metaKey: true, // Mocking Cmd
      preventDefault: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: '// const x = 1;' } });
  });

  it('auto-indents on Enter after {', () => {
    const localContent = 'if (true) {';
    textareaRef.current.value = localContent;
    textareaRef.current.selectionStart = 11;
    textareaRef.current.selectionEnd = 11;

    const { result } = renderHook(() => useEditorShortcuts({ handleChange, textareaRef }));

    const event = {
      key: 'Enter',
      shiftKey: false,
      preventDefault: vi.fn(),
    };

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

    const event = {
      key: 'Tab',
      preventDefault: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onAcceptSuggestion).toHaveBeenCalledWith('completion');
    // Normal Tab indentation should NOT be called
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

    const event = {
      key: 'Escape',
      preventDefault: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCancelSuggestion).toHaveBeenCalledWith({ pauseUntilEdit: true });
    expect(handleChange).not.toHaveBeenCalled();
  });
});

vi.mock('@/utils/formatter', () => ({
  formatCode: vi.fn((code) => `formatted: ${code}`),
}));

describe('useEditorShortcuts formatting', () => {
  let handleChange;
  let textareaRef;

  beforeEach(() => {
    vi.clearAllMocks();
    handleChange = vi.fn();
    textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        value: 'unformatted',
        focus: vi.fn(),
      },
    };
  });

  it('formats code with Control+Shift+F', () => {
    const { result } = renderHook(() =>
      useEditorShortcuts({ handleChange, textareaRef, filePath: 'test.js' }),
    );

    const event = {
      key: 'f',
      ctrlKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    result.current.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith({ target: { value: 'formatted: unformatted' } });
  });
});
