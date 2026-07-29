import type { PreviewEvidence } from './preview-types';

type PreviewEvidenceListener = ((evidence: PreviewEvidence | null) => void) | null;

let latestEvidence: PreviewEvidence | null = null;
let listener: PreviewEvidenceListener = null;

export function reportPreviewEvidence(evidence: PreviewEvidence) {
  latestEvidence = evidence && typeof evidence === 'object' ? evidence : null;
  listener?.(latestEvidence);
}

export function getLatestPreviewEvidence(): PreviewEvidence | null {
  return latestEvidence;
}

export function setPreviewEvidenceListener(fn: PreviewEvidenceListener) {
  listener = typeof fn === 'function' ? fn : null;
}
