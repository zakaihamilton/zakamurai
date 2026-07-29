import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

describe('workspace-index-worker', () => {
  let messageHandler: (event: { data: Record<string, unknown> }) => void;
  let postMessageSpy: Mock<(message: unknown) => void>;

  beforeEach(async () => {
    vi.resetModules();
    postMessageSpy = vi.fn();
    globalThis.self = {
      addEventListener: vi.fn((event: string, handler: typeof messageHandler) => {
        if (event === 'message') messageHandler = handler;
      }),
      postMessage: postMessageSpy,
    } as unknown as Window & typeof globalThis;
    await import('./workspace-index-worker');
  });

  it('handles APPLY, HEALTH, QUERY_TEXT, and SYMBOLS messages', () => {
    expect(messageHandler).toBeDefined();

    messageHandler({
      data: {
        id: 1,
        type: 'APPLY',
        payload: {
          entries: [
            { path: 'src/index.js', content: 'function helloWorld() {}', hash: 'h1', bytes: 24 },
            { path: 'src/deleted.js', deleted: true },
          ],
        },
      },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith({
      id: 1,
      type: 'SUCCESS',
      payload: { indexedFiles: 1 },
    });

    messageHandler({
      data: { id: 2, type: 'HEALTH' },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith({
      id: 2,
      type: 'SUCCESS',
      payload: { totalFiles: 1, indexedBytes: 24 },
    });

    messageHandler({
      data: { id: 3, type: 'QUERY_TEXT', payload: { query: 'hello' } },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 3,
        type: 'SUCCESS',
        payload: expect.arrayContaining([expect.objectContaining({ path: 'src/index.js' })]),
      }),
    );

    messageHandler({
      data: { id: 4, type: 'SYMBOLS', payload: { query: 'hello' } },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 4,
        type: 'SUCCESS',
        payload: expect.arrayContaining([
          expect.objectContaining({ name: 'helloWorld', path: 'src/index.js' }),
        ]),
      }),
    );

    messageHandler({
      data: { id: 5, type: 'INVALID' },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith({
      id: 5,
      type: 'ERROR',
      error: 'Unknown workspace index action: INVALID',
    });
  });
});
