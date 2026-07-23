import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HIGHLIGHT_WORKER_THRESHOLD,
  _resetHighlightWorkerForTests,
  highlightCodeAsync,
  highlightCodeSync,
} from './highlightClient';

vi.mock('./highlighter', () => ({
  highlightCode: vi.fn(() => 'SYNC_HTML'),
}));

describe('highlightClient', () => {
  afterEach(() => {
    _resetHighlightWorkerForTests();
    vi.unstubAllGlobals();
  });

  it('highlights small buffers synchronously via highlightCodeAsync', async () => {
    const html = await highlightCodeAsync('const x = 1;', 'a.js', {}, undefined, false, '', -1);
    expect(html).toBe('SYNC_HTML');
    expect(HIGHLIGHT_WORKER_THRESHOLD).toBeGreaterThan(100);
  });

  it('exposes sync helper used for first paint', () => {
    expect(highlightCodeSync('x', 'a.js', {})).toBe('SYNC_HTML');
  });

  it('cancel resolves with null for in-flight worker requests', async () => {
    class FakeWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage() {
        // Leave pending until cancelled
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    const large = 'x'.repeat(HIGHLIGHT_WORKER_THRESHOLD + 10);
    const request = highlightCodeAsync(large, 'a.js', {}, undefined, false, '', -1);
    request.cancel();
    await expect(request).resolves.toBeNull();
  });

  it('falls back to sync HTML when the worker errors', async () => {
    class FakeWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
        queueMicrotask(() => this.onerror?.(new ErrorEvent('error')));
      }
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    const large = 'x'.repeat(HIGHLIGHT_WORKER_THRESHOLD + 10);
    await expect(highlightCodeAsync(large, 'a.js', {}, undefined, false, '', -1)).resolves.toBe(
      'SYNC_HTML',
    );
  });
});
