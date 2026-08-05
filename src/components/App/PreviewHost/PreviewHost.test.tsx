import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewHost from './PreviewHost';

function setLocation(url: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: new URL(url),
  });
}

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
    setLocation('http://localhost:3001/?session=s123');
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
    setLocation('http://localhost:3001/?session=s123');
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
    setLocation('http://localhost:3001/?session=s123');
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'zakamurai-preview-connect', sessionId: 's123' }),
      expect.stringMatching(/localhost:300[01]/),
    );
  });

  it('acknowledges the IDE after accepting a MessagePort handshake', () => {
    setLocation('http://localhost:3001/?session=s123');
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
      expect.stringMatching(/localhost:300[01]/),
    );
  });

  it('waits for a root-scoped worker to control the page before fetching the entry', async () => {
    setLocation('http://localhost:3001/?session=s123');
    const ideWindow = { postMessage: vi.fn() };
    window.opener = ideWindow;

    let controller: ServiceWorker | null = null;
    const worker = {
      state: 'activated' as ServiceWorkerState,
      scriptURL: 'http://localhost:3001/__preview_sw__.js?v=27',
      postMessage: vi.fn((message: { type?: string }) => {
        if (message.type !== 'claim') return;
        controller = worker as unknown as ServiceWorker;
        Object.defineProperty(navigator.serviceWorker, 'controller', {
          configurable: true,
          value: controller,
        });
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      }),
    };
    const registration = {
      active: worker,
      installing: null,
      waiting: null,
    } as unknown as ServiceWorkerRegistration;
    const serviceWorker = Object.assign(new EventTarget(), {
      controller,
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (!controller) {
        return new Response('worker did not control page', { status: 503 });
      }
      return new Response('<!doctype html><html><body>Preview</body></html>');
    });

    render(<PreviewHost />);

    const channel = new MessageChannel();
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
      Object.defineProperty(event, 'ports', { value: [channel.port2] });
      window.dispatchEvent(event);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const initCall = worker.postMessage.mock.calls.find(([message]) => message.type === 'init');
    expect(initCall).toBeDefined();
    act(() => {
      serviceWorker.dispatchEvent(
        new MessageEvent('message', { data: { type: 'init-ok', sessionId: 's123' } }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/__preview/s123/dist/index.html',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(controller).toBe(worker);
  });

  it('rejects a matching handshake from an unknown same-origin window', () => {
    setLocation('http://localhost:3001/?session=s123');
    const ideWindow = { postMessage: vi.fn() };
    const unknownWindow = { postMessage: vi.fn() };
    window.opener = ideWindow;

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
      Object.defineProperty(event, 'source', { value: unknownWindow });
      Object.defineProperty(event, 'ports', { value: [{}] });
      window.dispatchEvent(event);
    });

    expect(
      ideWindow.postMessage.mock.calls.some(
        ([message]) => (message as { type?: string })?.type === 'zakamurai-preview-connect-ack',
      ),
    ).toBe(false);
    expect(unknownWindow.postMessage).not.toHaveBeenCalled();
  });

  it('reads session id from window.name when query param is absent', () => {
    window.name = 'zakamurai-preview-from-name';
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'from-name' }),
      expect.stringMatching(/localhost:300[01]/),
    );
  });

  it('reads session id from external-tab window.name prefix', () => {
    window.name = 'zakamurai-preview-tab-external-session';
    const postMessageSpy = vi.fn();
    window.opener = { postMessage: postMessageSpy };

    render(<PreviewHost />);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'external-session' }),
      expect.stringMatching(/localhost:300[01]/),
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
