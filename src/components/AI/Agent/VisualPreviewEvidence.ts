import type { PreviewEvidence } from '@/components/App/Views/PreviewArea/preview-types';

type VisualPreviewEvidence = {
  title: string;
  headings: string[];
  namedInteractiveElements: string[];
  landmarks: string[];
  runtimeErrors: string[];
  issues: string[];
  screenshotCaptured: boolean;
};

/** Returns a deterministic failure when a preview result cannot support visual review. */
export function visualPreviewInspectionFailure(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return 'Preview inspection returned no structured evidence.';
  }
  const record = value as Record<string, unknown>;
  if (record.status === 'failed' || record.status === 'unavailable') {
    return `Preview inspection did not complete: ${String(record.diagnostics || record.status)}.`;
  }
  const elements = Array.isArray(record.elements) ? record.elements.map(String) : [];
  const evidence = summarizeVisualPreviewEvidence({
    title: typeof record.title === 'string' ? record.title : undefined,
    text: typeof record.domSummary === 'string' ? record.domSummary : undefined,
    elements,
    screenshotCaptured: record.screenshotCaptured === true,
  });
  if (!elements.length) {
    return 'Preview inspection produced no DOM landmarks or interactive elements. Wait for the rendered app and inspect the preview again.';
  }
  if (!evidence.screenshotCaptured) {
    return 'Preview inspection did not capture a screenshot. Wait for the rendered app and inspect the preview again before finishing.';
  }
  if (evidence.runtimeErrors.length) {
    return `Preview inspection reported runtime errors: ${evidence.runtimeErrors.join('; ')}.`;
  }
  return null;
}

/**
 * Converts the preview bridge's compact DOM evidence into checks a text-only
 * coding model can reason about without pretending it can assess pixels.
 */
export function summarizeVisualPreviewEvidence(
  evidence: PreviewEvidence | null | undefined,
  runtimeErrors: string[] = [],
): VisualPreviewEvidence {
  const elements = evidence?.elements || [];
  const headingPrefix = /^h[1-6]:\s*/i;
  const interactivePrefix = /^(button|a|input|select|textarea|role):\s*/i;
  const headings = elements.filter((element) => headingPrefix.test(element));
  const namedInteractiveElements = elements.filter(
    (element) => interactivePrefix.test(element) && !/\:\s*$/.test(element),
  );
  const landmarks = [
    ...elements
      .filter((element) => /^(main|nav|header|footer|role):/i.test(element))
      .map((element) => element.split(':')[0].toLowerCase()),
    headings.length ? 'heading hierarchy' : '',
    namedInteractiveElements.length ? 'named interactive elements' : '',
  ].filter(Boolean);
  const issues = [
    runtimeErrors.length ? 'runtime errors reported' : '',
    headings.length ? '' : 'no headings found in preview evidence',
    elements.some((element) => interactivePrefix.test(element)) && !namedInteractiveElements.length
      ? 'interactive elements are missing accessible names'
      : '',
  ].filter(Boolean);

  return {
    title: evidence?.title || '',
    headings,
    namedInteractiveElements,
    landmarks,
    runtimeErrors,
    issues,
    screenshotCaptured: Boolean(evidence?.screenshotCaptured),
  };
}
