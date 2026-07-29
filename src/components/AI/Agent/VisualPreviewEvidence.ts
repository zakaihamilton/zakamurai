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
