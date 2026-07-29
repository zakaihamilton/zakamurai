import { createMockHighlightState } from '@/test-utils/editorMocks';
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

const highlightArgs = [
  'a.js',
  createMockHighlightState(),
  undefined,
  false,
  '',
  -1,
  undefined,
  { line: 1, col: 1, index: 0 },
  false,
] as const;

describe('highlightClient', () => {
  afterEach(() => {
    _resetHighlightWorkerForTests();
    vi.unstubAllGlobals();
  });

  it('highlights small buffers synchronously via highlightCodeAsync', async () => {
    const html = await highlightCodeAsync('const x = 1;', ...highlightArgs);
    expect(html).toBe('SYNC_HTML');
    expect(HIGHLIGHT_WORKER_THRESHOLD).toBeGreaterThan(100);
  });

  it('exposes sync helper used for first paint', () => {
    expect(highlightCodeSync('x', 'a.js', createMockHighlightState())).toBe('SYNC_HTML');
  });

  it('cancel resolves with null for in-flight worker requests', async () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage() {
        // Leave pending until cancelled
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    const large = 'x'.repeat(HIGHLIGHT_WORKER_THRESHOLD + 10);
    const request = highlightCodeAsync(large, ...highlightArgs);
    request.cancel?.();
    await expect(request).resolves.toBeNull();
  });

  it('falls back to sync HTML when the worker errors', async () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onerror?.(new ErrorEvent('error')));
      }
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    const large = 'x'.repeat(HIGHLIGHT_WORKER_THRESHOLD + 10);
    await expect(highlightCodeAsync(large, ...highlightArgs)).resolves.toBe('SYNC_HTML');
  });
});
