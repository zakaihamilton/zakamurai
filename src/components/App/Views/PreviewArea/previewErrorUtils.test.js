import { describe, expect, it, vi } from 'vitest';
import {
  createTransformErrorResponse,
  detectIframeLoadError,
  extractTransformErrorFromResponse,
  fetchScriptErrorBody,
  formatEsbuildTransformError,
  formatRuntimeError,
  formatUnhandledRejection,
  isHtmlErrorDocument,
  normalizeTransformError,
  resolveMissingExportError,
  toPreviewFetchUrl,
} from './previewErrorUtils';

describe('previewErrorUtils', () => {
  describe('formatEsbuildTransformError', () => {
    it('includes all esbuild error details', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed with 2 errors:',
        errors: [
          {
            text: 'Unexpected closing "div" tag does not match opening "span" tag',
            location: { file: '/src/components/AnimatedCard.jsx', line: 27, column: 8 },
          },
          {
            text: 'Unterminated regular expression',
            location: { file: '/src/components/AnimatedCard.jsx', line: 42, column: 5 },
          },
        ],
      });

      expect(message).toContain('Transform failed with 2 errors:');
      expect(message).toContain('/src/components/AnimatedCard.jsx:27:8: ERROR:');
      expect(message).toContain('Unexpected closing "div" tag');
      expect(message).toContain('/src/components/AnimatedCard.jsx:42:5: ERROR:');
      expect(message).toContain('Unterminated regular expression');
    });
  });

  describe('createTransformErrorResponse', () => {
    it('embeds the full message without console.error', () => {
      const response = createTransformErrorResponse(
        'Transform failed with 1 error:\n/src/App.jsx:1:1: ERROR: Unexpected token',
      );
      const text = new TextDecoder().decode(response.body);
      expect(text).toContain('// Transform failed with 1 error:');
      expect(text).toContain('// /src/App.jsx:1:1: ERROR: Unexpected token');
      expect(text).toContain('export default function PreviewTransformErrorPlaceholder');
      expect(text).not.toContain('console.error');
    });
  });

  describe('normalizeTransformError', () => {
    it('recognizes esbuild transform failures', () => {
      const text = `Transform failed with 5 errors:
/src/components/AnimatedCard.jsx:27:8: ERROR: Unexpected closing "div" tag`;
      expect(normalizeTransformError(text)).toContain('Transform failed with 5 errors');
    });

    it('recognizes almostnode transform error stubs', () => {
      const text = `// Transform Error: Transform failed with 5 errors:
/src/components/AnimatedCard.jsx:27:8: ERROR: Unexpected closing "div" tag
console.error("Transform failed with 5 errors");`;
      expect(normalizeTransformError(text)).toContain('Transform failed with 5 errors');
    });

    it('recognizes multi-line silent transform error stubs', () => {
      const text = `// Transform failed with 2 errors:
// /src/App.jsx:1:1: ERROR: Unexpected token
// /src/App.jsx:2:1: ERROR: Expected identifier
export default function PreviewTransformErrorPlaceholder() { return null; }`;
      expect(normalizeTransformError(text)).toContain('/src/App.jsx:1:1: ERROR: Unexpected token');
      expect(normalizeTransformError(text)).toContain(
        '/src/App.jsx:2:1: ERROR: Expected identifier',
      );
    });
  });

  describe('resolveMissingExportError', () => {
    it('fetches transform details from the failed module specifier', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        headers: {
          get: (name) => (name === 'X-Transform-Error' ? 'true' : null),
        },
        text: async () =>
          `// Transform failed with 1 error:
// /src/components/AnimatedCard.jsx:27:8: ERROR: Unexpected closing "div" tag
export default function PreviewTransformErrorPlaceholder() { return null; }`,
      }));

      const result = await resolveMissingExportError(
        {
          message:
            "Uncaught SyntaxError: The requested module './components/AnimatedCard' does not provide an export named 'default' (at App.jsx:5:3)",
          filename: 'http://localhost/preview/src/App.jsx',
        },
        fetchImpl,
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        'http://localhost/preview/src/components/AnimatedCard',
      );
      expect(result).toContain('AnimatedCard.jsx:27:8');
    });
  });

  describe('extractTransformErrorFromResponse', () => {
    it('extracts transform errors from almostnode dev server responses', () => {
      const body = new TextEncoder().encode(`// Transform Error: Transform failed with 2 errors:
/src/App.jsx:1:1: ERROR: Unexpected token
console.error("Transform failed with 2 errors");`);

      const message = extractTransformErrorFromResponse({
        headers: { 'X-Transform-Error': 'true' },
        body,
      });

      expect(message).toContain('Transform failed with 2 errors');
    });
  });

  describe('formatRuntimeError', () => {
    it('includes message, location, and truncated stack', () => {
      const stack = ['Error: boom', '  at foo (app.js:1:1)', '  at bar (app.js:2:2)'].join('\n');
      const result = formatRuntimeError({
        message: 'boom',
        filename: 'app.js',
        lineno: 10,
        colno: 3,
        error: { stack },
      });

      expect(result).toContain('boom');
      expect(result).toContain('at app.js:10:3');
      expect(result).toContain('Error: boom');
    });

    it('falls back to resource load message when message is empty', () => {
      expect(formatRuntimeError({ filename: 'script.js' })).toBe(
        'Failed to load resource: script.js',
      );
    });
  });

  describe('formatUnhandledRejection', () => {
    it('formats Error reasons with stack', () => {
      const result = formatUnhandledRejection({
        reason: new Error('async fail'),
      });
      expect(result).toContain('async fail');
    });

    it('returns string reasons as-is', () => {
      expect(formatUnhandledRejection({ reason: 'broken promise' })).toBe('broken promise');
    });
  });

  describe('detectIframeLoadError', () => {
    it('detects service worker plain-text errors', () => {
      const doc = {
        title: '',
        body: { innerText: 'Service Worker Error: virtual server unavailable' },
        querySelector: () => null,
      };
      expect(detectIframeLoadError(doc)).toBe('Service Worker Error: virtual server unavailable');
    });

    it('detects decode errors', () => {
      const doc = {
        title: '',
        body: { innerText: 'Decode error: invalid base64' },
        querySelector: () => null,
      };
      expect(detectIframeLoadError(doc)).toBe('Decode error: invalid base64');
    });

    it('detects fallback preview timeout page', () => {
      const doc = {
        title: 'Preview Loading...',
        body: {
          innerText:
            'Service worker did not activate.\nPlease go back and compile your project first.',
        },
        querySelector: () => null,
      };
      expect(detectIframeLoadError(doc)).toBe(
        'Service worker did not activate. Please go back and compile your project first.',
      );
    });

    it('detects transform errors rendered in the page body', () => {
      const doc = {
        title: 'My App',
        body: {
          innerText:
            'Transform failed with 5 errors:\n/src/components/AnimatedCard.jsx:27:8: ERROR: Unexpected closing "div" tag',
        },
        querySelector: () => null,
      };
      expect(detectIframeLoadError(doc)).toContain('Transform failed with 5 errors');
    });

    it('detects vite error overlay content', () => {
      const doc = {
        title: 'My App',
        body: { innerText: '' },
        querySelector: () => ({ innerText: 'Transform failed with 1 error' }),
      };
      expect(detectIframeLoadError(doc)).toBe('Transform failed with 1 error');
    });

    it('returns null for normal preview documents', () => {
      const doc = {
        title: 'My App',
        body: { innerText: 'Hello world' },
        querySelector: () => null,
      };
      expect(detectIframeLoadError(doc)).toBeNull();
    });
  });

  describe('fetchScriptErrorBody', () => {
    it('returns transform error text from failed module responses', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => ({
        ok: true,
        headers: {
          get: (name) => (name === 'X-Transform-Error' ? 'true' : null),
        },
        text: async () =>
          `// Transform Error: Transform failed with 1 error:
/src/App.jsx:1:1: ERROR: Unexpected token
console.error("Transform failed with 1 error");`,
      }));

      const result = await fetchScriptErrorBody('/preview/src/App.jsx');
      expect(result).toContain('Transform failed with 1 error');

      global.fetch = originalFetch;
    });

    it('ignores host Next.js 404 HTML from bare /dist asset probes', async () => {
      const fetchImpl = vi.fn(async (url) => {
        expect(url).toBe('https://www.zakamurai.com/preview/dist/assets/main.js');
        return {
          ok: false,
          headers: { get: (name) => (name === 'content-type' ? 'text/html; charset=utf-8' : null) },
          text: async () =>
            '<!DOCTYPE html><html><head><title>404: This page could not be found.</title></head><body>404</body></html>',
        };
      });

      await expect(
        fetchScriptErrorBody('https://www.zakamurai.com/dist/assets/main.js', fetchImpl),
      ).resolves.toBeNull();
    });

    it('ignores HTML bodies even when content-type is missing', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: false,
        headers: { get: () => null },
        text: async () =>
          '<!DOCTYPE html><html><title>404: This page could not be found.</title></html>',
      }));

      await expect(fetchScriptErrorBody('/dist/assets/main.js', fetchImpl)).resolves.toBeNull();
    });

    it('ignores successful JavaScript bundles that contain ERROR: substrings', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        headers: { get: (name) => (name === 'content-type' ? 'application/javascript' : null) },
        text: async () =>
          'var React={};throw Error("Objects are not valid as a React child");details.push(`${where}: ERROR: ${text}`);',
      }));

      await expect(
        fetchScriptErrorBody('/dist/assets/index-abc123.js', fetchImpl),
      ).resolves.toBeNull();
    });
  });

  describe('toPreviewFetchUrl', () => {
    it('prefixes bare /dist paths with /preview', () => {
      expect(toPreviewFetchUrl('/dist/assets/main.js', 'https://www.zakamurai.com')).toBe(
        'https://www.zakamurai.com/preview/dist/assets/main.js',
      );
      expect(
        toPreviewFetchUrl(
          'https://www.zakamurai.com/preview/dist/index.html',
          'https://www.zakamurai.com',
        ),
      ).toBe('https://www.zakamurai.com/preview/dist/index.html');
    });
  });

  describe('isHtmlErrorDocument', () => {
    it('detects HTML documents and Next.js 404 pages', () => {
      expect(isHtmlErrorDocument('<!DOCTYPE html><html></html>')).toBe(true);
      expect(isHtmlErrorDocument('ok', 'text/html')).toBe(true);
      expect(isHtmlErrorDocument('Service Worker Error: unavailable')).toBe(false);
    });
  });
});
