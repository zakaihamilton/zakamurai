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

  it('acknowledges the IDE after accepting a MessagePort handshake', () => {
    window.location = new URL('http://localhost:3001/?session=s123');
    const ideWindow = { postMessage: vi.fn() };
    window.opener = ideWindow;

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(() => new Promise(() => {})),
        ready: new Promise(() => {}),
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    render(<PreviewHost />);

    act(() => {
      const event = new MessageEvent('message', {
        data: {
          type: 'zakamurai-preview-connect',
          version: 1,
          sessionId: 's123',
        },
        origin: 'http://localhost:3000',
      });
      Object.defineProperty(event, 'source', { value: ideWindow });
      Object.defineProperty(event, 'ports', { value: [{}] });
      window.dispatchEvent(event);
    });

    expect(ideWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zakamurai-preview-connect-ack',
        sessionId: 's123',
        surface: 'external',
      }),
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

  it('reads session id from external-tab window.name prefix', () => {
    window.name = 'zakamurai-preview-tab-external-session';
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'external-session' }),
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
