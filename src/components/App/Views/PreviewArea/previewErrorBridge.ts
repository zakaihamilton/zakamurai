import { reportDiagnostic } from '@/components/Diagnostics';

type PreviewErrorListener = ((message: string) => void) | null;

let listener: PreviewErrorListener = null;

export function setPreviewErrorListener(fn: PreviewErrorListener) {
  listener = fn;
}

export function reportPreviewError(message: string) {
  if (message) reportDiagnostic({ source: 'preview', severity: 'error', message });
  if (!message || !listener) return;
  listener(message);
}

export function shouldReportPreviewError(level: string, message: string) {
  if (level === 'error') return true;
  return /transform failed|compilation error|\bERR:/i.test(message);
}
