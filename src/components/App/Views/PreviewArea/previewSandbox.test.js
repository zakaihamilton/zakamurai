import { describe, expect, it } from 'vitest';
import {
  injectPreviewErrorBridge,
  parsePreviewMessage,
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
} from './previewSandbox';

describe('previewSandbox', () => {
  it('injects the error bridge before </head>', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const next = injectPreviewErrorBridge(html);
    expect(next).toContain('__zakamuraiPreviewBridge');
    expect(next.indexOf('__zakamuraiPreviewBridge')).toBeLessThan(next.indexOf('</head>'));
  });

  it('is idempotent', () => {
    const html = '<html><head></head><body></body></html>';
    const once = injectPreviewErrorBridge(html);
    const twice = injectPreviewErrorBridge(once);
    expect(twice).toBe(once);
  });

  it('parses only trusted preview messages', () => {
    expect(parsePreviewMessage(null)).toBeNull();
    expect(parsePreviewMessage({ source: 'other', type: 'runtime-error' })).toBeNull();
    expect(
      parsePreviewMessage({
        source: PREVIEW_MESSAGE_SOURCE,
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'boom',
      }),
    ).toEqual({
      source: PREVIEW_MESSAGE_SOURCE,
      type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
      message: 'boom',
    });
  });
});
