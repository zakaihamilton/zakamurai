import { PreviewState } from '@/components/App/PreviewState';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewArea, { PreviewAreaUiState } from './PreviewArea';
import { PREVIEW_IFRAME_SANDBOX, PREVIEW_MESSAGE_TYPES } from './previewSandbox';

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => {
    return React.cloneElement(children, { title: content });
  },
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it('handles toolbar actions correctly', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1.0,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<PreviewArea />);

    // Zoom in
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(ui.hook).toHaveBeenCalled();

    // Zoom out
    fireEvent.click(screen.getByTitle('Zoom out'));
    expect(ui.hook).toHaveBeenCalled();

    // Zoom reset
    fireEvent.click(screen.getByText('100%'));
    expect(ui.hook).toHaveBeenCalled();

    // Refresh
    fireEvent.click(screen.getByTitle('Refresh preview'));
    expect(ui.hook).toHaveBeenCalled();

    // Maximize
    fireEvent.click(screen.getByTitle('Maximize preview'));
    expect(ui.hook).toHaveBeenCalled();

    // Open in new tab
    fireEvent.click(screen.getByTitle('Open in new tab'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:3001\/preview-host\?session=/),
      expect.stringMatching(/^zakamurai-preview-/),
    );
  });

  it('reports a service-worker activation timeout', () => {
    vi.useFakeTimers();
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: false,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: false,
      isMaximized: false,
      address: '/preview/',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(ui.state.error).toMatch(/service worker did not activate/i);
  });

  it('accepts runtime errors sent by the active preview iframe', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
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
    const iframe = screen.getByTitle('Preview');
    const event = new MessageEvent('message', {
      data: {
        source: 'zakamurai-preview',
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'Uncaught ReferenceError: app is not defined',
      },
      origin: 'http://localhost:3001',
    });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(ui.state.error).toBe('Uncaught ReferenceError: app is not defined');
    expect(preview.state.serverError).toBe('Uncaught ReferenceError: app is not defined');
  });

  it('renders a successful preview after an earlier compile error is cleared', () => {
    const preview = createStateHook({
      htmlContent: null,
      isCompilerReady: true,
      restoreError: null,
      compileError: 'Build failed',
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

    const { rerender } = render(<PreviewArea />);
    expect(screen.getByText('Build failed')).toBeDefined();

    preview.hook.htmlContent = '<html><body>Recovered</body></html>';
    preview.hook.compileError = null;
    rerender(<PreviewArea />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTitle('Preview')).toBeDefined();
  });

  it('loads the preview from the isolated origin with its own service-worker origin', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: false,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/dist/index.html',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);

    const iframe = screen.getByTitle('Preview');
    expect(iframe.getAttribute('sandbox')).toBe(PREVIEW_IFRAME_SANDBOX);
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe.getAttribute('referrerpolicy')).toBeNull();
    expect(iframe.getAttribute('src')).toMatch(/^http:\/\/localhost:3001\/preview-host\?session=/);
    expect(iframe.getAttribute('name')).toMatch(/^zakamurai-preview-/);
  });

  it('keeps iframe element mounted and suppresses loading overlay on refresh after initial load', () => {
    const preview = createStateHook({
      htmlContent: '<html><body>Hello</body></html>',
      isCompilerReady: true,
      restoreError: null,
    });
    const ui = createStateHook({
      isLoading: true,
      scale: 1,
      error: null,
      refreshKey: 1,
      isSwReady: true,
      isMaximized: false,
      address: '/preview/dist/index.html',
      host: 'localhost',
    });

    vi.spyOn(PreviewState, 'useState').mockReturnValue(preview.hook);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui.hook);

    render(<PreviewArea />);
    const iframe = screen.getByTitle('Preview');

    // Simulate initial iframe load event
    fireEvent.load(iframe);

    // Now trigger refresh
    fireEvent.click(screen.getByTitle('Refresh preview'));

    // Loading state is active, but loading overlay element should NOT be rendered in viewport
    expect(document.querySelector(`.${iframe.className}`)).not.toBeNull();
    expect(document.querySelector('[class*="loadingOverlay"]')).toBeNull();
  });
});
