import { describe, expect, it } from 'vitest';
import {
  reportPreviewError,
  setPreviewErrorListener,
  shouldReportPreviewError,
} from './previewErrorBridge';

describe('previewErrorBridge', () => {
  it('reports transform failures to the active listener', () => {
    const messages: string[] = [];
    setPreviewErrorListener((message) => messages.push(message));
    reportPreviewError('Transform failed with 5 errors');
    setPreviewErrorListener(null);
    expect(messages).toEqual(['Transform failed with 5 errors']);
  });

  it('matches transform and error console messages', () => {
    expect(shouldReportPreviewError('error', 'something broke')).toBe(true);
    expect(shouldReportPreviewError('log', 'Transform failed with 2 errors')).toBe(true);
    expect(shouldReportPreviewError('log', 'compiled successfully')).toBe(false);
  });
});
