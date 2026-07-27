import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('workspace-index-worker', () => {
  let messageHandler;
  let postMessageSpy;

  beforeEach(async () => {
    vi.resetModules();
    postMessageSpy = vi.fn();
    globalThis.self = {
      addEventListener: vi.fn((event, handler) => {
        if (event === 'message') messageHandler = handler;
      }),
      postMessage: postMessageSpy,
    };
    await import('./workspace-index-worker');
  });

  it('handles APPLY, HEALTH, QUERY_TEXT, and SYMBOLS messages', () => {
    expect(messageHandler).toBeDefined();

    // APPLY
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

    // HEALTH
    messageHandler({
      data: { id: 2, type: 'HEALTH' },
    });
    expect(postMessageSpy).toHaveBeenLastCalledWith({
      id: 2,
      type: 'SUCCESS',
      payload: { totalFiles: 1, indexedBytes: 24 },
    });

    // QUERY_TEXT
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

    // SYMBOLS
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

    // Unknown action error
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
