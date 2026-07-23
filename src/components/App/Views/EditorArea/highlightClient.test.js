import { describe, expect, it, vi } from 'vitest';
import {
  HIGHLIGHT_WORKER_THRESHOLD,
  highlightCodeAsync,
  highlightCodeSync,
} from './highlightClient';

vi.mock('./highlighter', () => ({
  highlightCode: vi.fn(() => 'SYNC_HTML'),
}));

describe('highlightClient', () => {
  it('highlights small buffers synchronously via highlightCodeAsync', async () => {
    const html = await highlightCodeAsync('const x = 1;', 'a.js', {}, undefined, false, '', -1);
    expect(html).toBe('SYNC_HTML');
    expect(HIGHLIGHT_WORKER_THRESHOLD).toBeGreaterThan(100);
  });

  it('exposes sync helper used for first paint', () => {
    expect(highlightCodeSync('x', 'a.js', {})).toBe('SYNC_HTML');
  });
});
