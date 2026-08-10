import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_IFRAME_SANDBOX,
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
  collectPreviewStyleEvidence,
  injectPreviewErrorBridge,
  isTrustedPreviewMessage,
  parsePreviewMessage,
  sanitizePreviewPath,
} from './previewSandbox';

describe('previewSandbox', () => {
  it('preserves the isolated preview origin for its service worker', () => {
    expect(PREVIEW_IFRAME_SANDBOX.split(/\s+/)).toEqual(
      expect.arrayContaining(['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups']),
    );
  });

  it('injects the error bridge before </head>', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const next = injectPreviewErrorBridge(html);
    expect(next).toContain('__zakamuraiPreviewBridge');
    expect(next.indexOf('__zakamuraiPreviewBridge')).toBeLessThan(next.indexOf('</head>'));
    expect(next).toContain('control.labels');
    expect(next).toContain('matchesSurface');
    expect(next).toContain('firstElementChild');
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
    expect(
      parsePreviewMessage({
        source: PREVIEW_MESSAGE_SOURCE,
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: { nested: true },
      })?.message,
    ).toBe('[object Object]');
  });

  it('bounds and preserves computed style audit evidence', () => {
    const parsed = parsePreviewMessage({
      source: PREVIEW_MESSAGE_SOURCE,
      type: PREVIEW_MESSAGE_TYPES.EVIDENCE,
      styleAudit: {
        horizontalOverflow: true,
        collapsedControls: ['Save'],
        missingExplicitColors: ['body background'],
        contrastFailures: ['button 1.2:1'],
        unnamedControls: ['input'],
        missingFocusVisible: true,
        issues: ['horizontal overflow'],
      },
    });
    expect(parsed?.styleAudit).toMatchObject({
      horizontalOverflow: true,
      collapsedControls: ['Save'],
      missingFocusVisible: true,
      issues: ['horizontal overflow'],
    });
  });

  it('recognizes associated labels, scoped page colors, and per-control focus rules', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({ width: 32, height: 32 }) as DOMRect;
    document.body.innerHTML = `<style>
      .root_hash { color: rgb(20, 20, 20); background: rgb(245, 245, 245); }
      .control_hash:focus-visible { outline: 2px solid currentColor; }
    </style><div id="root"><main class="root_hash"><label for="note">Note</label><input id="note" class="control_hash" /></main></div>`;
    try {
      const evidence = collectPreviewStyleEvidence(document, window);
      expect(evidence.styleAudit).toMatchObject({
        unnamedControls: [],
        missingExplicitColors: [],
        missingFocusVisible: false,
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      document.body.innerHTML = '';
    }
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
    expect(sanitizePreviewPath('/preview/%2e%2e/etc/passwd')).toBeNull();
    expect(sanitizePreviewPath('/preview/%252e%252e/etc/passwd')).toBeNull();
    expect(sanitizePreviewPath('\\preview\\x')).toBeNull();
  });

  it('never accepts generated external or traversal navigation paths (property)', () => {
    fc.assert(
      fc.property(fc.string(), (suffix) => {
        expect(sanitizePreviewPath(`https://attacker.test/${suffix}`)).toBeNull();
        expect(sanitizePreviewPath(`/preview/../${suffix}`)).toBeNull();
      }),
    );
  });

  it('requires event.source to match the preview iframe window', () => {
    const iframeWindow = {} as Window;
    const good = {
      source: iframeWindow,
      origin: 'null',
      data: {
        source: PREVIEW_MESSAGE_SOURCE,
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'x',
      },
    } as MessageEvent;
    const spoofed = {
      source: {},
      origin: 'null',
      data: good.data,
    } as MessageEvent;
    expect(isTrustedPreviewMessage(good, iframeWindow)).toBe(true);
    expect(isTrustedPreviewMessage(spoofed, iframeWindow)).toBe(false);
    expect(isTrustedPreviewMessage(good, null)).toBe(false);
  });
});
