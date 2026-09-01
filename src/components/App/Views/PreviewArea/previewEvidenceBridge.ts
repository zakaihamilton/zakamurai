import type { PreviewEvidence } from './preview-types';

type PreviewEvidenceListener = ((evidence: PreviewEvidence | null) => void) | null;

let latestEvidence: PreviewEvidence | null = null;
let listener: PreviewEvidenceListener = null;
let evidenceRevision = 0;

export function reportPreviewEvidence(evidence: PreviewEvidence) {
  latestEvidence = evidence && typeof evidence === 'object' ? evidence : null;
  evidenceRevision += 1;
  listener?.(latestEvidence);
}

export function getLatestPreviewEvidence(): PreviewEvidence | null {
  return latestEvidence;
}

/** Clears evidence before a rebuild so callers cannot mistake a previous preview for a fresh one. */
export function clearPreviewEvidence(): number {
  latestEvidence = null;
  evidenceRevision += 1;
  listener?.(null);
  return evidenceRevision;
}

/** Waits for evidence reported after a specific rebuild, preferring the screenshot-bearing report. */
export function waitForPreviewEvidence(
  afterRevision: number,
  timeoutMs = 5000,
): Promise<PreviewEvidence | null> {
  const freshEvidence = evidenceRevision > afterRevision ? latestEvidence : null;
  if (freshEvidence?.screenshotCaptured) return Promise.resolve(freshEvidence);

  return new Promise((resolve) => {
    let candidate: PreviewEvidence | null = freshEvidence;
    const previousListener = listener;
    const finish = (evidence: PreviewEvidence | null) => {
      clearTimeout(timeout);
      listener = previousListener;
      resolve(evidence);
    };
    const timeout = setTimeout(() => finish(candidate), timeoutMs);
    listener = (evidence) => {
      previousListener?.(evidence);
      if (evidenceRevision <= afterRevision || !evidence) return;
      candidate = evidence;
      if (evidence.screenshotCaptured) finish(evidence);
    };
  });
}

export function setPreviewEvidenceListener(fn: PreviewEvidenceListener) {
  listener = typeof fn === 'function' ? fn : null;
}
