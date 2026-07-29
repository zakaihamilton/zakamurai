let latestEvidence = null;
let listener = null;

export function reportPreviewEvidence(evidence) {
  latestEvidence = evidence && typeof evidence === 'object' ? evidence : null;
  listener?.(latestEvidence);
}

export function getLatestPreviewEvidence() {
  return latestEvidence;
}

export function setPreviewEvidenceListener(fn) {
  listener = typeof fn === 'function' ? fn : null;
}
