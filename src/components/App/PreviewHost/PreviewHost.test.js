import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewHost from './PreviewHost';

describe('PreviewHost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: new URL('http://localhost:3001/'),
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

  it('waits for IDE handshake when window.opener is missing', () => {
    window.location = new URL('http://localhost:3001/?session=s123');
    render(<PreviewHost />);
    expect(screen.getByText('Connecting isolated preview…')).toBeDefined();
    expect(
      screen.queryByText(
        'Preview must be opened from Zakamurai so it can access the in-memory build.',
      ),
    ).toBeNull();
  });

  it('shows connection error after timeout when no handshake arrives', () => {
    vi.useFakeTimers();
    window.location = new URL('http://localhost:3001/?session=s123');
    render(<PreviewHost />);
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(
      screen.getByText(
        'Preview must be opened from Zakamurai so it can access the in-memory build.',
      ),
    ).toBeDefined();
    vi.useRealTimers();
  });

  it('posts PREVIEW_CONNECT when valid session and peerWindow exist', () => {
    window.location = new URL('http://localhost:3001/?session=s123');
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'zakamurai-preview-connect', sessionId: 's123' }),
      'http://localhost:3000',
    );
  });

  it('reads session id from window.name when query param is absent', () => {
    window.name = 'zakamurai-preview-from-name';
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'from-name' }),
      'http://localhost:3000',
    );
  });

  it('posts PREVIEW_CONNECT to the derived IDE origin on branch preview hosts', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: new URL('https://preview.example.com/?session=s123'),
    });
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'zakamurai-preview-connect', sessionId: 's123' }),
      'https://example.com',
    );
  });
});
