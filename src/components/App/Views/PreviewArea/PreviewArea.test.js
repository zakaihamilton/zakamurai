import { PreviewState } from '@/components/App/PreviewState';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewArea, { PreviewAreaUiState } from './PreviewArea';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => children,
}));

function createStateHook(initialState) {
  const state = { ...initialState };
  const hook = vi.fn((updater) => {
    if (typeof updater === 'function') {
      updater(state);
    }
  });
  Object.assign(hook, state);
  return { hook, state };
}

describe('PreviewArea', () => {
  it('renders inline error banner instead of a dialog', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: 'ReferenceError: x is not defined',
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('ReferenceError: x is not defined')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('dismisses the error banner', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: 'Runtime failure',
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(ui.hook).toHaveBeenCalled();
    expect(ui.state.error).toBeNull();
  });

  it('shows restore errors from PreviewState', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: 'Failed to sync preview files',
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Failed to sync preview files')).toBeDefined();
  });

  it('shows compile errors when no preview html is available', () => {
    const preview = createStateHook({
      htmlContent: null,
      isCompilerReady: true,
      restoreError: null,
      compileError: 'Command failed with exit code 1',
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Command failed with exit code 1')).toBeDefined();
  });

  it('clears restore and compile errors when dismissed', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: 'Restore failed',
      compileError: 'Build failed',
      serverError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(preview.state.restoreError).toBeNull();
    expect(preview.state.compileError).toBeNull();
    expect(preview.state.serverError).toBeNull();
  });

  it('shows server transform errors from PreviewState', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
      compileError: null,
      serverError: 'Transform failed with 5 errors',
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);

    expect(screen.getByText('Transform failed with 5 errors')).toBeDefined();
    expect(screen.getByLabelText('Copy error')).toBeDefined();
    expect(screen.getByLabelText('Dismiss error')).toBeDefined();
  });

  it('copies the preview error to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });

    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: 'Transform failed with 5 errors',
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy error'));
    });

    expect(writeText).toHaveBeenCalledWith('Transform failed with 5 errors');
  });
});
