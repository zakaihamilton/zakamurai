import { PreviewState } from '@/components/App/PreviewState';
import { makePreviewAreaUiState, makePreviewState } from '@/test-utils/stateMocks';
import type { PreviewAreaUiStateShape, PreviewStateShape } from '@/types/domain-types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewArea, { PreviewAreaUiState } from './PreviewArea';
import { getPreviewOrigins } from './previewOrigins';
import { PREVIEW_MESSAGE_TYPES } from './previewSandbox';

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { useState: vi.fn() },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({
    children,
    content,
  }: { children: ReactElement<{ title?: ReactNode }>; content: ReactNode }) => {
    return React.cloneElement(children, { title: content });
  },
}));

function createPreviewMocks(
  previewOverrides: Partial<PreviewStateShape> = {},
  uiOverrides: Partial<PreviewAreaUiStateShape> = {},
) {
  return {
    preview: makePreviewState(previewOverrides),
    ui: makePreviewAreaUiState(uiOverrides),
  };
}

describe('PreviewArea', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('dismisses the error banner through preview state', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { error: 'Runtime failure' },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(ui).toHaveBeenCalled();
    expect(ui.error).toBeNull();
  });

  it('shows restore errors from PreviewState', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: 'Failed to sync preview files',
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Failed to sync preview files')).toBeDefined();
  });

  it('warns when preview shares the IDE origin', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', '');
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    expect(screen.getByRole('status').textContent).toMatch(/same origin/);
  });

  it('shows compile errors when no preview html is available', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: null,
        isCompilerReady: true,
        restoreError: null,
        compileError: 'Command failed with exit code 1',
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Command failed with exit code 1')).toBeDefined();
  });

  it('clears restore and compile errors when dismissed', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: 'Restore failed',
        compileError: 'Build failed',
        serverError: null,
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(preview.restoreError).toBeNull();
    expect(preview.compileError).toBeNull();
    expect(preview.serverError).toBeNull();
  });

  it('shows server transform errors from PreviewState', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
        compileError: null,
        serverError: 'Transform failed with 5 errors',
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);

    expect(screen.getByText('Transform failed with 5 errors')).toBeDefined();
    expect(screen.getByLabelText('Copy error')).toBeDefined();
    expect(screen.getByLabelText('Dismiss error')).toBeDefined();
  });

  it('copies the preview error to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });

    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { error: 'Transform failed with 5 errors' },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy error'));
    });

    expect(writeText).toHaveBeenCalledWith('Transform failed with 5 errors');
  });

  it('handles toolbar actions correctly', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { scale: 1.0, error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<PreviewArea />);

    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(ui).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Zoom out'));
    expect(ui).toHaveBeenCalled();
    fireEvent.click(screen.getByText('100%'));
    expect(ui).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Refresh preview'));
    expect(ui).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Maximize preview'));
    expect(ui).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Open in new tab'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:(3000|3001)\/.*[?&]session=/),
      expect.stringMatching(/^zakamurai-preview-tab-/),
    );
  });

  it('reports a service-worker activation timeout', () => {
    vi.useFakeTimers();
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: false,
        restoreError: null,
      },
      { isSwReady: false, error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(ui.error).toMatch(/service worker did not activate/i);
  });

  it('accepts runtime errors sent by the active preview iframe', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    const origins = getPreviewOrigins({ windowOrigin: window.location.origin });
    const event = new MessageEvent('message', {
      data: {
        source: 'zakamurai-preview',
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'Uncaught ReferenceError: app is not defined',
      },
      origin: origins.previewOrigin || 'http://localhost:3000',
    });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(ui.error).toBe('Uncaught ReferenceError: app is not defined');
    expect(preview.serverError).toBe('Uncaught ReferenceError: app is not defined');
  });

  it('ignores opaque Script error messages from the preview bridge', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    const origins = getPreviewOrigins({ windowOrigin: window.location.origin });
    const event = new MessageEvent('message', {
      data: {
        source: 'zakamurai-preview',
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'Script error.',
      },
      origin: origins.previewOrigin || 'http://localhost:3000',
    });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(ui.error).toBeNull();
    expect(preview.serverError).toBeNull();
  });

  it('renders a successful preview after an earlier compile error is cleared', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: null,
        isCompilerReady: true,
        restoreError: null,
        compileError: 'Build failed',
      },
      { error: null },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    const { rerender } = render(<PreviewArea />);
    expect(screen.getByText('Build failed')).toBeDefined();

    preview.htmlContent = '<html><body>Recovered</body></html>';
    preview.compileError = null;
    rerender(<PreviewArea />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTitle('Preview')).toBeDefined();
  });

  it('updates scale precisely without floating-point precision inaccuracies on zoom in/out', () => {
    const { preview, ui } = createPreviewMocks(
      {
        htmlContent: '<html><body>Hello</body></html>',
        isCompilerReady: true,
        restoreError: null,
      },
      { scale: 1.1, address: '/preview/dist/index.html' },
    );

    vi.mocked(PreviewState.useState).mockReturnValue(preview);
    vi.spyOn(PreviewAreaUiState, 'useState').mockReturnValue(ui);

    render(<PreviewArea />);

    fireEvent.click(screen.getByTitle('Zoom in'));
    const zoomInUpdater = vi.mocked(ui).mock.calls.at(-1)?.[0] as (draft: {
      scale: number;
    }) => void;
    const draftIn = { scale: 1.1 };
    zoomInUpdater(draftIn);
    expect(draftIn.scale).toBe(1.2);

    fireEvent.click(screen.getByTitle('Zoom out'));
    const zoomOutUpdater = vi.mocked(ui).mock.calls.at(-1)?.[0] as (draft: {
      scale: number;
    }) => void;
    const draftOut = { scale: 1.3 };
    zoomOutUpdater(draftOut);
    expect(draftOut.scale).toBe(1.2);
  });
});
