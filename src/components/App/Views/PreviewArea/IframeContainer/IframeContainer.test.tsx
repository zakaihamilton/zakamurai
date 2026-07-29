import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_IFRAME_SANDBOX } from '../previewSandbox';
import PreviewIframeContainer from './IframeContainer';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    AlertCircle: () => <span>alert</span>,
    Check: () => <span>check</span>,
    Copy: () => <span>copy</span>,
    Close: () => <span>close</span>,
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe('PreviewIframeContainer', () => {
  const baseProps = {
    isLoading: false,
    hasLoadedOnce: false,
    showInitOverlay: false,
    displayError: null,
    errorCopied: false,
    onCopyError: vi.fn(),
    onDismissError: vi.fn(),
    scale: 1,
    isCompilerReady: true,
    iframeRef: createRef<HTMLIFrameElement>(),
    previewUrl: 'http://localhost:3001/?session=test',
    previewSessionId: 'session-1',
    onLoad: vi.fn(),
  };

  it('renders the preview iframe with sandbox and session name', () => {
    render(<PreviewIframeContainer {...baseProps} />);

    const iframe = screen.getByTitle('Preview');
    expect(iframe.getAttribute('sandbox')).toBe(PREVIEW_IFRAME_SANDBOX);
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe.getAttribute('src')).toBe(baseProps.previewUrl);
    expect(iframe.getAttribute('name')).toBe('zakamurai-preview-session-1');
  });

  it('shows the initial loading overlay before the first load', () => {
    const { container } = render(
      <PreviewIframeContainer {...baseProps} isLoading={true} hasLoadedOnce={false} />,
    );

    expect(container.querySelector('[class*="loadingOverlay"]')).toBeDefined();
  });

  it('suppresses the loading overlay after the iframe has loaded once', () => {
    const onLoad = vi.fn();
    const { container, rerender } = render(
      <PreviewIframeContainer
        {...baseProps}
        isLoading={true}
        hasLoadedOnce={false}
        onLoad={onLoad}
      />,
    );

    fireEvent.load(screen.getByTitle('Preview'));
    expect(onLoad).toHaveBeenCalled();

    rerender(
      <PreviewIframeContainer
        {...baseProps}
        isLoading={true}
        hasLoadedOnce={true}
        onLoad={onLoad}
      />,
    );
    expect(screen.getByTitle('Preview')).toBeDefined();
    expect(container.querySelector('[class*="loadingOverlay"]')).toBeNull();
  });
});
