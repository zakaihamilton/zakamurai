let listener = null;

export function setPreviewErrorListener(fn) {
  listener = fn;
}

export function reportPreviewError(message) {
  if (!message || !listener) return;
  listener(message);
}

export function shouldReportPreviewError(level, message) {
  if (level === 'error') return true;
  return /transform failed|compilation error|\bERR:/i.test(message);
}
