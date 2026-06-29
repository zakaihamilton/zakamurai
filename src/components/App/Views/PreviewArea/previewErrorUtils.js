const MAX_STACK_LINES = 5;
const MAX_STACK_LENGTH = 500;
const MAX_ERROR_LENGTH = 4000;

function truncateStack(stack) {
  const lines = stack.split('\n').slice(0, MAX_STACK_LINES);
  let result = lines.join('\n');
  if (result.length > MAX_STACK_LENGTH) {
    result = `${result.slice(0, MAX_STACK_LENGTH)}...`;
  }
  return result;
}

export function truncatePreviewError(message) {
  if (!message) return message;
  if (message.length <= MAX_ERROR_LENGTH) return message;
  return `${message.slice(0, MAX_ERROR_LENGTH)}...`;
}

export function formatEsbuildTransformError(error) {
  if (!error) return 'Transform failed';

  const details = [];
  const errorList = error.errors || error.cause?.errors;

  if (Array.isArray(errorList) && errorList.length > 0) {
    for (const item of errorList) {
      const location = item.location;
      const file = location?.file || location?.filePath || '';
      const where =
        location?.line != null
          ? `${file}:${location.line}:${location.column ?? 0}`.replace(/^:/, '')
          : file;
      const text = item.text?.trim() || item.message?.trim();
      if (where && text) {
        details.push(`${where}: ERROR: ${text}`);
      } else if (text) {
        details.push(text);
      }
    }
  }

  const header = error.message?.trim() || 'Transform failed';
  if (details.length === 0) return truncatePreviewError(header);
  return truncatePreviewError([header, ...details].join('\n'));
}

export function createTransformErrorResponse(message) {
  const commented = message
    .split('\n')
    .map((line) => `// ${line}`)
    .join('\n');
  const body = `${commented}
export default function PreviewTransformErrorPlaceholder() {
  return null;
}
`;
  const buffer = new TextEncoder().encode(body);
  return {
    statusCode: 200,
    statusMessage: 'OK',
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-cache',
      'X-Transform-Error': 'true',
    },
    body: buffer,
  };
}

export function extractTransformErrorFromStub(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.includes('PreviewTransformErrorPlaceholder') || trimmed.includes('export default')) {
    const commentLines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('//'))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
    if (commentLines.length > 0) {
      return truncatePreviewError(commentLines.join('\n'));
    }
  }

  if (trimmed.includes('export {}')) {
    const commentLines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('//'))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
    if (commentLines.length > 0) {
      return truncatePreviewError(commentLines.join('\n'));
    }
  }

  const legacyMatch = trimmed.match(/^\/\/ Transform Error: ([\s\S]*?)(?:\r?\nconsole\.error|$)/m);
  if (legacyMatch?.[1]) {
    return truncatePreviewError(legacyMatch[1].trim());
  }

  return null;
}

export function normalizeTransformError(text) {
  const fromStub = extractTransformErrorFromStub(text);
  if (fromStub) return fromStub;

  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('Transform failed')) {
    return truncatePreviewError(trimmed);
  }
  if (/\bERROR:/i.test(trimmed) || trimmed.includes('Unexpected closing')) {
    return truncatePreviewError(trimmed);
  }
  return null;
}

export function decodeResponseBody(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  try {
    return new TextDecoder().decode(new Uint8Array(body));
  } catch {
    return '';
  }
}

export function extractTransformErrorMessage(text) {
  return normalizeTransformError(text);
}

export function extractTransformErrorFromResponse(response) {
  if (!response?.headers) return null;

  const headers = response.headers;
  const hasError =
    headers['X-Transform-Error'] === 'true' || headers['x-transform-error'] === 'true';
  const text = decodeResponseBody(response.body);
  const message = extractTransformErrorMessage(text);

  if (message) return message;
  if (hasError && text.trim()) return truncatePreviewError(text.trim());
  return null;
}

export function isMissingDefaultExportError(message) {
  return /does not provide an export named ['"]default['"]/i.test(message || '');
}

export async function fetchScriptErrorBody(url, fetchImpl = fetch) {
  if (!url) return null;
  try {
    const response = await fetchImpl(url);
    const text = await response.text();
    const transformHeader =
      response.headers.get('X-Transform-Error') || response.headers.get('x-transform-error');
    const extracted = extractTransformErrorMessage(text);
    if (extracted) return extracted;
    if (transformHeader === 'true' && text.trim()) {
      return truncatePreviewError(text.trim());
    }
    if (!response.ok && text.trim()) {
      return truncatePreviewError(text.trim());
    }
  } catch {
    // Ignore fetch failures for error enrichment.
  }
  return null;
}

export function extractFailedModuleSpecifier(message) {
  const match = message.match(/requested module ['"]([^'"]+)['"]/i);
  return match?.[1] || null;
}

export async function resolveMissingExportError(event, fetchImpl = fetch) {
  const message = event?.message || '';
  if (!isMissingDefaultExportError(message)) return null;

  const specifier = extractFailedModuleSpecifier(message);
  const baseUrl = event.filename || event.target?.src;
  if (specifier && baseUrl) {
    try {
      const moduleUrl = new URL(specifier, baseUrl).href;
      const fetched = await fetchScriptErrorBody(moduleUrl, fetchImpl);
      if (fetched) return fetched;
    } catch {
      // Ignore invalid module URLs.
    }
  }

  const scriptUrl = event.target?.src || event.filename;
  if (scriptUrl) {
    return fetchScriptErrorBody(scriptUrl, fetchImpl);
  }

  return null;
}

export function formatRuntimeError(event) {
  const parts = [];
  const message = event.message?.trim();
  const { filename, lineno, colno } = event;

  if (message) {
    parts.push(message);
  } else if (filename) {
    parts.push(`Failed to load resource: ${filename}`);
  } else {
    parts.push('An unknown error occurred in the preview.');
  }

  if (filename && lineno) {
    const location = colno ? `${filename}:${lineno}:${colno}` : `${filename}:${lineno}`;
    if (!message || !message.includes(filename)) {
      parts.push(`at ${location}`);
    }
  }

  const stack = event.error?.stack;
  if (stack) {
    const truncated = truncateStack(stack);
    if (truncated && !parts.join('\n').includes(truncated.split('\n')[0])) {
      parts.push(truncated);
    }
  }

  return truncatePreviewError(parts.join('\n'));
}

export function formatUnhandledRejection(event) {
  const { reason } = event;
  if (reason instanceof Error) {
    const stack = reason.stack ? `\n${truncateStack(reason.stack)}` : '';
    return truncatePreviewError(`${reason.message}${stack}`);
  }
  if (typeof reason === 'string') {
    return truncatePreviewError(reason);
  }
  return 'An unhandled promise rejection occurred in the preview.';
}

function extractViteOverlayError(doc) {
  const overlay = doc.querySelector('#vite-error-overlay, vite-error-overlay');
  const overlayText = overlay?.innerText?.trim();
  if (overlayText) {
    return truncatePreviewError(overlayText);
  }
  return null;
}

export function detectIframeLoadError(doc) {
  if (!doc?.body) return null;

  const overlayError = extractViteOverlayError(doc);
  if (overlayError) return overlayError;

  const bodyText = doc.body.innerText?.trim() || '';
  const title = doc.title || '';

  const transformError = normalizeTransformError(bodyText);
  if (transformError) return transformError;

  if (bodyText.startsWith('Service Worker Error:')) {
    return truncatePreviewError(bodyText);
  }
  if (bodyText.startsWith('Decode error:')) {
    return truncatePreviewError(bodyText);
  }

  if (title === 'Preview Loading...') {
    if (bodyText.includes('Service worker did not activate')) {
      return 'Service worker did not activate. Please go back and compile your project first.';
    }
    if (bodyText.includes('Service Workers are not supported')) {
      return 'Service Workers are not supported in this browser.';
    }
  }

  return null;
}
