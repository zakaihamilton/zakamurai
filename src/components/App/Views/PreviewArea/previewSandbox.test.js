import { describe, expect, it } from 'vitest';
import {
  injectPreviewErrorBridge,
  isTrustedPreviewMessage,
  parsePreviewMessage,
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
  sanitizePreviewPath,
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

  it('sanitizes navigate paths to /preview only', () => {
    expect(sanitizePreviewPath('/preview/dist/index.html')).toBe('/preview/dist/index.html');
    expect(sanitizePreviewPath('/preview')).toBe('/preview');
    expect(sanitizePreviewPath('/app/preview/dist/index.html')).toBe(
      '/app/preview/dist/index.html',
    );
    expect(sanitizePreviewPath('https://evil.example/x')).toBeNull();
    expect(sanitizePreviewPath('//evil.example/x')).toBeNull();
    expect(sanitizePreviewPath('/dist/index.html')).toBeNull();
    expect(sanitizePreviewPath('/preview/../etc/passwd')).toBeNull();
    expect(sanitizePreviewPath('\\preview\\x')).toBeNull();
  });

  it('requires event.source to match the preview iframe window', () => {
    const iframeWindow = {};
    const good = {
      source: iframeWindow,
      origin: 'null',
      data: {
        source: PREVIEW_MESSAGE_SOURCE,
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'x',
      },
    };
    const spoofed = {
      source: {},
      origin: 'null',
      data: good.data,
    };
    expect(isTrustedPreviewMessage(good, iframeWindow)).toBe(true);
    expect(isTrustedPreviewMessage(spoofed, iframeWindow)).toBe(false);
    expect(isTrustedPreviewMessage(good, null)).toBe(false);
  });
});
