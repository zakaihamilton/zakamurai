import { asFetchImpl } from '@/test-utils/fetchMocks';
import { asPartialError, asPreviewDocument } from '@/test-utils/previewMocks';
import { describe, expect, it, vi } from 'vitest';
import {
  createTransformErrorResponse,
  decodeResponseBody,
  detectIframeLoadError,
  extractFailedModuleSpecifier,
  extractTransformErrorFromResponse,
  extractTransformErrorFromStub,
  fetchScriptErrorBody,
  formatEsbuildTransformError,
  formatRuntimeError,
  formatUnhandledRejection,
  isHtmlErrorDocument,
  isMissingDefaultExportError,
  isOpaqueScriptError,
  normalizeTransformError,
  resolveMissingExportError,
  toPreviewFetchUrl,
  truncatePreviewError,
} from './previewErrorUtils';

describe('previewErrorUtils', () => {
  describe('truncatePreviewError', () => {
    it('returns null and empty strings as-is', () => {
      expect(truncatePreviewError(null)).toBeNull();
      expect(truncatePreviewError('')).toBe('');
      expect(truncatePreviewError(undefined)).toBeUndefined();
    });

    it('returns short messages unchanged', () => {
      expect(truncatePreviewError('short error')).toBe('short error');
    });

    it('truncates messages longer than 4000 characters', () => {
      const long = 'x'.repeat(4001);
      const result = truncatePreviewError(long);
      expect(result).toBeDefined();
      if (!result) return;
      expect(result).toHaveLength(4003);
      expect(result.endsWith('...')).toBe(true);
      expect(result.startsWith('x'.repeat(4000))).toBe(true);
    });
  });

  describe('formatEsbuildTransformError', () => {
    it('returns default message for null error', () => {
      expect(formatEsbuildTransformError(null)).toBe('Transform failed');
    });

    it('returns header only when error list is empty', () => {
      expect(formatEsbuildTransformError({ message: 'Custom failure', errors: [] })).toBe(
        'Custom failure',
      );
      expect(formatEsbuildTransformError({ message: '  Trimmed header  ' })).toBe('Trimmed header');
    });

    it('reads errors from cause.errors', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        cause: {
          errors: [
            {
              text: 'syntax error',
              location: { filePath: '/src/App.jsx', line: 3, column: 7 },
            },
          ],
        },
      });
      expect(message).toContain('/src/App.jsx:3:7: ERROR: syntax error');
    });

    it('formats errors with filePath only when line is missing', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        errors: [{ text: 'file-path only', location: { filePath: '/src/App.jsx' } }],
      });
      expect(message).toContain('/src/App.jsx: ERROR: file-path only');
    });

    it('includes text-only errors without location', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        errors: [{ text: '  bare diagnostic  ' }],
      });
      expect(message).toContain('bare diagnostic');
      expect(message).not.toContain('ERROR:');
    });

    it('defaults column to 0 when missing', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        errors: [{ text: 'missing column', location: { file: '/src/App.jsx', line: 9 } }],
      });
      expect(message).toContain('/src/App.jsx:9:0: ERROR: missing column');
    });

    it('formats errors with file path only when line is missing', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        errors: [{ text: 'file-only location', location: { file: '/src/App.jsx' } }],
      });
      expect(message).toContain('/src/App.jsx: ERROR: file-only location');
      expect(message).not.toContain('/src/App.jsx::');
    });

    it('uses message field when text is absent', () => {
      const message = formatEsbuildTransformError({
        message: 'Transform failed',
        errors: [
          { message: '  from message field  ', location: { file: '/a.js', line: 1, column: 1 } },
        ],
      });
      expect(message).toContain('from message field');
    });

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

    it('returns null for empty or unrecognized text', () => {
      expect(normalizeTransformError('')).toBeNull();
      expect(normalizeTransformError('   ')).toBeNull();
      expect(normalizeTransformError('random bundle output')).toBeNull();
    });

    it('extracts errors from export {} stubs', () => {
      const text = `// Export empty stub error
// /src/App.jsx:5:1: ERROR: Missing export
export {}`;
      expect(normalizeTransformError(text)).toContain('/src/App.jsx:5:1: ERROR: Missing export');
    });

    it('returns null for placeholder stubs without comment lines', () => {
      const text = 'export default function PreviewTransformErrorPlaceholder() { return null; }';
      expect(normalizeTransformError(text)).toBeNull();
    });

    it('recognizes esbuild diagnostics without Transform failed header', () => {
      const text = '/src/App.jsx:12:4: ERROR: Unexpected token';
      expect(normalizeTransformError(text)).toBe('/src/App.jsx:12:4: ERROR: Unexpected token');
    });

    it('recognizes Unexpected closing errors with file location', () => {
      const text =
        '/src/Card.jsx:27:8: Unexpected closing "div" tag does not match opening "span" tag';
      expect(normalizeTransformError(text)).toContain('Unexpected closing');
    });

    it('recognizes legacy Transform Error comment stubs', () => {
      const text = `// Transform Error: Legacy transform failure
console.error("Transform failed");`;
      expect(normalizeTransformError(text)).toBe('Legacy transform failure');
    });
  });

  describe('decodeResponseBody', () => {
    it('returns empty string for falsy bodies', () => {
      expect(decodeResponseBody(null)).toBe('');
      expect(decodeResponseBody(undefined)).toBe('');
    });

    it('returns string bodies unchanged', () => {
      expect(decodeResponseBody('hello world')).toBe('hello world');
    });

    it('decodes Uint8Array bodies', () => {
      expect(decodeResponseBody(new TextEncoder().encode('encoded'))).toBe('encoded');
    });

    it('decodes ArrayBuffer views', () => {
      const buffer = new ArrayBuffer(2);
      const view = new Uint8Array(buffer);
      view[0] = 97;
      view[1] = 98;
      expect(decodeResponseBody(new DataView(buffer))).toBe('ab');
    });

    it('returns empty string when decoding fails', () => {
      expect(decodeResponseBody({ not: 'decodable' })).toBe('');
    });
  });

  describe('resolveMissingExportError', () => {
    it('returns null for non-export errors', async () => {
      const fetchImpl = vi.fn();
      await expect(
        resolveMissingExportError({ message: 'TypeError: boom' }, fetchImpl),
      ).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fetches transform details from the failed module specifier', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: true,
        headers: {
          get: (name: string) => (name === 'X-Transform-Error' ? 'true' : null),
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

    it('falls back to script src when module fetch returns nothing', async () => {
      const fetchImpl = asFetchImpl(
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            headers: { get: () => null },
            text: async () => '',
          })
          .mockResolvedValueOnce({
            ok: true,
            headers: {
              get: (name: string) => (name.toLowerCase() === 'x-transform-error' ? 'true' : null),
            },
            text: async () =>
              `// Transform failed with 1 error:
// /src/App.jsx:1:1: ERROR: Unexpected token
export default function PreviewTransformErrorPlaceholder() { return null; }`,
          }),
      );

      const result = await resolveMissingExportError(
        {
          message:
            "The requested module './components/Card' does not provide an export named 'default'",
          filename: 'http://localhost/preview/src/App.jsx',
        },
        fetchImpl,
      );

      expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost/preview/src/components/Card');
      expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://localhost/preview/src/App.jsx');
      expect(result).toContain('Unexpected token');
    });

    it('uses event.target.src when specifier URL resolution fails', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => null },
        text: async () => 'Service Worker Error: virtual server unavailable',
      }));

      const result = await resolveMissingExportError(
        {
          message: "The requested module './App.jsx' does not provide an export named 'default'",
          filename: 'not-a-valid-base',
          target: { src: 'http://localhost/preview/src/main.js' },
        },
        fetchImpl,
      );

      expect(fetchImpl).toHaveBeenCalledWith('http://localhost/preview/src/main.js');
      expect(result).toBe('Service Worker Error: virtual server unavailable');
    });

    it('returns null when no script URL is available', async () => {
      const fetchImpl = vi.fn();
      await expect(
        resolveMissingExportError(
          {
            message:
              "The requested module './missing.js' does not provide an export named 'default'",
          },
          fetchImpl,
        ),
      ).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('extractTransformErrorFromResponse', () => {
    it('returns null when response has no headers', () => {
      expect(extractTransformErrorFromResponse(null as never)).toBeNull();
      expect(extractTransformErrorFromResponse({ body: 'text' })).toBeNull();
    });

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

    it('falls back to raw text when X-Transform-Error is set but stub parsing fails', () => {
      const message = extractTransformErrorFromResponse({
        headers: { 'x-transform-error': 'true' },
        body: '  Raw transform failure text  ',
      });
      expect(message).toBe('Raw transform failure text');
    });

    it('returns null when no message can be extracted', () => {
      expect(
        extractTransformErrorFromResponse({
          headers: { 'X-Transform-Error': 'false' },
          body: 'not a transform error',
        }),
      ).toBeNull();
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
        error: asPartialError({ stack }),
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

    it('returns unknown error when message and filename are missing', () => {
      expect(formatRuntimeError({})).toBe('An unknown error occurred in the preview.');
    });

    it('omits location when message already includes filename', () => {
      const result = formatRuntimeError({
        message: 'Error in app.js: something broke',
        filename: 'app.js',
        lineno: 10,
        colno: 3,
      });
      expect(result).toBe('Error in app.js: something broke');
      expect(result).not.toContain('at app.js:10:3');
    });

    it('formats location without column when colno is missing', () => {
      const result = formatRuntimeError({
        message: 'boom',
        filename: 'app.js',
        lineno: 10,
      });
      expect(result).toContain('at app.js:10');
      expect(result).not.toContain('at app.js:10:');
    });

    it('truncates long stacks to five lines and 500 characters', () => {
      const longLine = `  at fn (${'x'.repeat(200)}:1:1)`;
      const stack = ['Error: boom', ...Array(8).fill(longLine)].join('\n');
      const result = formatRuntimeError({
        message: 'boom',
        error: asPartialError({ stack }),
      });
      const stackPart = result.split('\n').slice(1);
      expect(stackPart.length).toBeLessThanOrEqual(5);
      expect(result.length).toBeLessThanOrEqual(520);
      expect(result.endsWith('...')).toBe(true);
    });

    it('skips stack when first stack line is already in the message', () => {
      const stack = 'Error: boom\n  at foo (app.js:1:1)';
      const result = formatRuntimeError({
        message: 'Error: boom',
        error: asPartialError({ stack }),
      });
      expect(result).toBe('Error: boom');
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

    it('returns default message for non-Error non-string reasons', () => {
      expect(formatUnhandledRejection({ reason: 42 })).toBe(
        'An unhandled promise rejection occurred in the preview.',
      );
      expect(formatUnhandledRejection({ reason: null })).toBe(
        'An unhandled promise rejection occurred in the preview.',
      );
    });

    it('formats Error reasons without stack when stack is missing', () => {
      const error = new Error('no stack');
      error.stack = undefined;
      expect(formatUnhandledRejection({ reason: error })).toBe('no stack');
    });
  });

  describe('isOpaqueScriptError', () => {
    it('returns false for non-string and empty values', () => {
      expect(isOpaqueScriptError(null)).toBe(false);
      expect(isOpaqueScriptError(undefined)).toBe(false);
      expect(isOpaqueScriptError(123)).toBe(false);
      expect(isOpaqueScriptError('')).toBe(false);
      expect(isOpaqueScriptError('   ')).toBe(false);
    });

    it('detects sanitized cross-origin script errors', () => {
      expect(isOpaqueScriptError('Script error.')).toBe(true);
      expect(isOpaqueScriptError('Script error')).toBe(true);
      expect(isOpaqueScriptError('Script error. at :0')).toBe(true);
      expect(isOpaqueScriptError('TypeError: boom')).toBe(false);
      expect(isOpaqueScriptError('Script error. at app.js:10')).toBe(false);
    });

    it('detects Script error variants with empty at location', () => {
      expect(isOpaqueScriptError('Script error at :')).toBe(true);
      expect(isOpaqueScriptError('Script error. at :')).toBe(true);
    });
  });

  describe('detectIframeLoadError', () => {
    it('returns null when document has no body', () => {
      expect(detectIframeLoadError(null)).toBeNull();
      expect(detectIframeLoadError(asPreviewDocument({}))).toBeNull();
      expect(detectIframeLoadError(asPreviewDocument({ title: 'x' }))).toBeNull();
    });

    it('detects service worker plain-text errors', () => {
      const doc = asPreviewDocument({
        title: '',
        body: { innerText: 'Service Worker Error: virtual server unavailable' },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBe('Service Worker Error: virtual server unavailable');
    });

    it('falls back to innerText when textContent is empty', () => {
      const doc = asPreviewDocument({
        title: '',
        body: {
          textContent: '',
          innerText: 'Service Worker Error: virtual server unavailable',
        },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBe('Service Worker Error: virtual server unavailable');
    });

    it('detects decode errors', () => {
      const doc = asPreviewDocument({
        title: '',
        body: { innerText: 'Decode error: invalid base64' },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBe('Decode error: invalid base64');
    });

    it('detects fallback preview timeout page', () => {
      const doc = asPreviewDocument({
        title: 'Preview Loading...',
        body: {
          innerText:
            'Service worker did not activate.\nPlease go back and compile your project first.',
        },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBe(
        'Service worker did not activate. Please go back and compile your project first.',
      );
    });

    it('detects unsupported service worker browser message', () => {
      const doc = asPreviewDocument({
        title: 'Preview Loading...',
        body: { innerText: 'Service Workers are not supported in this browser.' },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBe('Service Workers are not supported in this browser.');
    });

    it('detects transform errors rendered in the page body', () => {
      const doc = asPreviewDocument({
        title: 'My App',
        body: {
          innerText:
            'Transform failed with 5 errors:\n/src/components/AnimatedCard.jsx:27:8: ERROR: Unexpected closing "div" tag',
        },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toContain('Transform failed with 5 errors');
    });

    it('detects vite error overlay content', () => {
      const doc = asPreviewDocument({
        title: 'My App',
        body: { innerText: '' },
        querySelector: () => ({ innerText: 'Transform failed with 1 error' }),
      });
      expect(detectIframeLoadError(doc)).toBe('Transform failed with 1 error');
    });

    it('detects vite-error-overlay custom element', () => {
      const doc = asPreviewDocument({
        title: 'My App',
        body: { innerText: 'page content' },
        querySelector: (selector: string) =>
          selector === '#vite-error-overlay, vite-error-overlay'
            ? { innerText: 'Vite overlay error' }
            : null,
      });
      expect(detectIframeLoadError(doc)).toBe('Vite overlay error');
    });

    it('returns null for normal preview documents', () => {
      const doc = asPreviewDocument({
        title: 'My App',
        body: { innerText: 'Hello world' },
        querySelector: () => null,
      });
      expect(detectIframeLoadError(doc)).toBeNull();
    });
  });

  describe('fetchScriptErrorBody', () => {
    it('returns null for empty url', async () => {
      await expect(fetchScriptErrorBody(null as unknown as string)).resolves.toBeNull();
      await expect(fetchScriptErrorBody('')).resolves.toBeNull();
    });

    it('returns null when fetch throws', async () => {
      const fetchImpl = asFetchImpl(async () => {
        throw new Error('network failure');
      });
      await expect(fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl)).resolves.toBeNull();
    });

    it('returns transform error text from failed module responses', async () => {
      const originalFetch = global.fetch;
      global.fetch = asFetchImpl(async () => ({
        ok: true,
        headers: {
          get: (name: string) => (name === 'X-Transform-Error' ? 'true' : null),
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
      const fetchImpl = asFetchImpl(async (url) => {
        expect(url).toBe('https://www.zakamurai.com/preview/dist/assets/main.js');
        return {
          ok: false,
          headers: {
            get: (name: string) => (name === 'content-type' ? 'text/html; charset=utf-8' : null),
          },
          text: async () =>
            '<!DOCTYPE html><html><head><title>404: This page could not be found.</title></head><body>404</body></html>',
        };
      });

      await expect(
        fetchScriptErrorBody('https://www.zakamurai.com/dist/assets/main.js', fetchImpl),
      ).resolves.toBeNull();
    });

    it('ignores HTML bodies even when content-type is missing', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => null },
        text: async () =>
          '<!DOCTYPE html><html><title>404: This page could not be found.</title></html>',
      }));

      await expect(fetchScriptErrorBody('/dist/assets/main.js', fetchImpl)).resolves.toBeNull();
    });

    it('ignores successful JavaScript bundles that contain ERROR: substrings', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: true,
        headers: {
          get: (name: string) => (name === 'content-type' ? 'application/javascript' : null),
        },
        text: async () =>
          'var React={};throw Error("Objects are not valid as a React child");details.push(`${where}: ERROR: ${text}`);',
      }));

      await expect(
        fetchScriptErrorBody('/dist/assets/index-abc123.js', fetchImpl),
      ).resolves.toBeNull();
    });

    it('returns service worker errors from failed responses', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => null },
        text: async () => 'Service Worker Error: virtual server unavailable',
      }));
      await expect(fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl)).resolves.toBe(
        'Service Worker Error: virtual server unavailable',
      );
    });

    it('returns decode errors from failed responses', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => null },
        text: async () => 'Decode error: invalid base64',
      }));
      await expect(fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl)).resolves.toBe(
        'Decode error: invalid base64',
      );
    });

    it('returns raw text when X-Transform-Error header is set', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: true,
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'x-transform-error') return 'true';
            if (lower === 'content-type') return 'application/javascript';
            return null;
          },
        },
        text: async () => '  Raw failure without stub comments  ',
      }));
      await expect(fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl)).resolves.toBe(
        'Raw failure without stub comments',
      );
    });

    it('returns normalized transform errors from failed non-HTML responses', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => 'text/plain' },
        text: async () =>
          'Transform failed with 1 error:\n/src/App.jsx:1:1: ERROR: Unexpected token',
      }));
      const result = await fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl);
      expect(result).toContain('Transform failed with 1 error');
    });

    it('returns null for failed responses with unrecognized text', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => 'text/plain' },
        text: async () => 'random server error',
      }));
      await expect(fetchScriptErrorBody('/preview/src/App.jsx', fetchImpl)).resolves.toBeNull();
    });

    it('detects javascript modules from invalid URLs via extension fallback', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        headers: { get: () => null },
        text: async () => 'module.exports = {};',
      }));
      await expect(
        fetchScriptErrorBody('[[[not-a-valid-url]]].cjs', asFetchImpl(fetchMock)),
      ).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('toPreviewFetchUrl', () => {
    it('returns falsy urls unchanged', () => {
      expect(toPreviewFetchUrl(null as unknown as string)).toBeNull();
      expect(toPreviewFetchUrl('')).toBe('');
    });

    it('leaves /preview paths unchanged', () => {
      expect(toPreviewFetchUrl('/preview/src/App.jsx', 'http://localhost')).toBe(
        'http://localhost/preview/src/App.jsx',
      );
      expect(
        toPreviewFetchUrl('http://localhost/preview/dist/index.html', 'http://localhost'),
      ).toBe('http://localhost/preview/dist/index.html');
    });

    it('prefixes bare /dist paths with /preview', () => {
      expect(toPreviewFetchUrl('/dist/assets/main.js', 'https://www.zakamurai.com')).toBe(
        'https://www.zakamurai.com/preview/dist/assets/main.js',
      );
      expect(toPreviewFetchUrl('/dist', 'http://localhost')).toBe('http://localhost/preview/dist');
      expect(
        toPreviewFetchUrl(
          'https://www.zakamurai.com/preview/dist/index.html',
          'https://www.zakamurai.com',
        ),
      ).toBe('https://www.zakamurai.com/preview/dist/index.html');
    });

    it('returns original url when parsing fails', () => {
      expect(toPreviewFetchUrl('not-a-valid-url [[[')).toBe('not-a-valid-url [[[');
    });

    it('detects .mjs extensions for module responses via pathname', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        headers: { get: () => null },
        text: async () => 'valid module code',
      }));
      await fetchScriptErrorBody('/dist/assets/module.mjs', asFetchImpl(fetchMock));
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/preview\/dist\/assets\/module\.mjs$/),
      );
    });

    it('treats .cjs bundles as JavaScript modules and ignores successful responses', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/javascript' },
        text: async () => 'module.exports = { ok: true };',
      }));
      await expect(
        fetchScriptErrorBody('/dist/assets/legacy.cjs', asFetchImpl(fetchMock)),
      ).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/preview\/dist\/assets\/legacy\.cjs$/),
      );
    });
  });

  describe('isHtmlErrorDocument', () => {
    it('detects HTML documents and Next.js 404 pages', () => {
      expect(isHtmlErrorDocument('<!DOCTYPE html><html></html>')).toBe(true);
      expect(isHtmlErrorDocument('<html lang="en"><body></body></html>')).toBe(true);
      expect(isHtmlErrorDocument('ok', 'text/html')).toBe(true);
      expect(isHtmlErrorDocument('Service Worker Error: unavailable')).toBe(false);
    });

    it('returns false for empty text without html content-type', () => {
      expect(isHtmlErrorDocument('')).toBe(false);
      expect(isHtmlErrorDocument('   ')).toBe(false);
    });

    it('detects 404 page text without doctype', () => {
      expect(isHtmlErrorDocument('404: This page could not be found')).toBe(true);
    });
  });

  describe('isMissingDefaultExportError', () => {
    it('detects missing default export messages', () => {
      expect(
        isMissingDefaultExportError(
          "The requested module './App' does not provide an export named 'default'",
        ),
      ).toBe(true);
      expect(isMissingDefaultExportError('SyntaxError: Unexpected token')).toBe(false);
      expect(isMissingDefaultExportError(null)).toBe(false);
    });
  });

  describe('extractFailedModuleSpecifier', () => {
    it('extracts the module specifier from error text', () => {
      expect(
        extractFailedModuleSpecifier(
          "Uncaught SyntaxError: The requested module './components/Card' does not provide an export named 'default'",
        ),
      ).toBe('./components/Card');
      expect(extractFailedModuleSpecifier('no module here')).toBeNull();
    });
  });

  describe('extractTransformErrorFromStub', () => {
    it('returns null for unrecognized stub text', () => {
      expect(extractTransformErrorFromStub('export default function App() {}')).toBeNull();
    });

    it('returns the full message when it is exactly 4000 characters', () => {
      const exact = 'x'.repeat(4000);
      expect(truncatePreviewError(exact)).toBe(exact);
    });

    it('extracts export {} stub comments', () => {
      const text = `// /src/App.jsx:5:1: ERROR: Missing export
export {}`;
      expect(extractTransformErrorFromStub(text)).toContain('Missing export');
    });

    it('extracts legacy transform error comments', () => {
      const text = `// Transform Error: Legacy failure
console.error("Transform failed");`;
      expect(extractTransformErrorFromStub(text)).toBe('Legacy failure');
    });
  });

  describe('decodeResponseBody', () => {
    it('decodes Uint8Array and ArrayBufferView payloads', () => {
      const bytes = new TextEncoder().encode('module error');
      expect(decodeResponseBody(bytes)).toBe('module error');
      expect(decodeResponseBody(bytes.buffer)).toBe('module error');
    });

    it('returns an empty string for unsupported body shapes', () => {
      expect(decodeResponseBody(null)).toBe('');
      expect(decodeResponseBody({ bad: true })).toBe('');
    });
  });

  describe('formatUnhandledRejection', () => {
    it('formats Error reasons with truncated stacks', () => {
      const error = new Error('boom');
      error.stack = ['Error: boom', 'at run (file.js:1:1)', 'at test (file.js:2:2)'].join('\n');
      const message = formatUnhandledRejection({ reason: error });
      expect(message).toContain('boom');
      expect(message).toContain('at run');
    });

    it('formats string reasons and falls back for unknown values', () => {
      expect(formatUnhandledRejection({ reason: 'plain failure' })).toBe('plain failure');
      expect(formatUnhandledRejection({ reason: { code: 1 } })).toBe(
        'An unhandled promise rejection occurred in the preview.',
      );
    });
  });

  describe('formatRuntimeError', () => {
    it('falls back to filename when message is missing', () => {
      expect(formatRuntimeError({ filename: '/preview/src/App.jsx' })).toContain(
        'Failed to load resource: /preview/src/App.jsx',
      );
    });

    it('includes stack traces without duplicating the first line', () => {
      const error = new Error('runtime boom');
      error.stack = ['Error: runtime boom', 'at render (App.jsx:4:5)'].join('\n');
      const message = formatRuntimeError({
        message: 'runtime boom',
        filename: 'App.jsx',
        lineno: 4,
        colno: 5,
        error,
      });
      expect(message).toContain('runtime boom');
      expect(message).toContain('at render');
    });
  });

  describe('extractTransformErrorFromResponse', () => {
    it('returns raw text when transform header is set without stub comments', () => {
      const message = extractTransformErrorFromResponse({
        headers: { 'X-Transform-Error': 'true' },
        body: '  raw transform failure  ',
      });
      expect(message).toBe('raw transform failure');
    });
  });

  describe('normalizeTransformError', () => {
    it('accepts unexpected closing errors with file locations', () => {
      const text =
        '/src/App.jsx:12:4\nUnexpected closing "div" tag does not match opening "section" tag';
      expect(normalizeTransformError(text)).toContain('Unexpected closing');
    });
  });

  describe('resolveMissingExportError', () => {
    it('fetches module errors using event.target.src when filename is missing', async () => {
      const fetchImpl = asFetchImpl(async () => ({
        ok: false,
        headers: { get: () => 'text/plain' },
        text: async () => 'Service Worker Error: module unavailable',
      }));
      const message = await resolveMissingExportError(
        {
          message:
            "Uncaught SyntaxError: The requested module './Card.jsx' does not provide an export named 'default'",
          target: { src: 'http://localhost/preview/src/App.jsx' },
        },
        fetchImpl,
      );
      expect(message).toBe('Service Worker Error: module unavailable');
    });
  });
});
