import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewHost from './PreviewHost';

describe('PreviewHost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: new URL('http://localhost:3001/preview-host'),
    });
    Object.defineProperty(window, 'opener', { value: null, writable: true });
    window.name = '';
  });

  it('renders missing preview session error when no session present', () => {
    render(<PreviewHost />);
    expect(
      screen.getByText('Missing preview session. Return to Zakamurai and build the project again.'),
    ).toBeDefined();
  });

  it('renders missing peer window error when window.opener is missing', () => {
    window.location = new URL('http://localhost:3001/preview-host?session=s123');
    render(<PreviewHost />);
    expect(
      screen.getByText(
        'Preview must be opened from Zakamurai so it can access the in-memory build.',
      ),
    ).toBeDefined();
  });

  it('posts PREVIEW_CONNECT when valid session and peerWindow exist', () => {
    window.location = new URL('http://localhost:3001/preview-host?session=s123');
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'zakamurai-preview-connect', sessionId: 's123' }),
      'http://localhost:3000',
    );
  });
});
