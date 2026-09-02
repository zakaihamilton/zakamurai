import type { PreviewEvidence } from './preview-types';

type PreviewEvidenceListener = ((evidence: PreviewEvidence | null) => void) | null;

let latestEvidence: PreviewEvidence | null = null;
let listener: PreviewEvidenceListener = null;
let evidenceRevision = 0;
let runtimeErrors: string[] = [];

export const PREVIEW_EVIDENCE_SETTLE_MS = 250;

const mergeRuntimeErrors = (reported: string[] = []): string[] =>
  [...new Set([...runtimeErrors, ...reported].filter(Boolean))].slice(-20);

export function reportPreviewEvidence(evidence: PreviewEvidence) {
  if (evidence && typeof evidence === 'object') {
    runtimeErrors = mergeRuntimeErrors(evidence.runtimeErrors || []);
    latestEvidence = runtimeErrors.length
      ? { ...evidence, runtimeErrors: [...runtimeErrors] }
      : evidence;
  } else {
    latestEvidence = null;
    runtimeErrors = [];
  }
  evidenceRevision += 1;
  listener?.(latestEvidence);
}

/** Associates a trusted preview runtime error with the next DOM evidence report. */
export function reportPreviewRuntimeError(message: string) {
  const normalized = message.trim();
  if (!normalized) return;
  runtimeErrors = mergeRuntimeErrors([normalized]);
  if (latestEvidence) {
    latestEvidence = { ...latestEvidence, runtimeErrors: [...runtimeErrors] };
    listener?.(latestEvidence);
  }
}

export function getLatestPreviewEvidence(): PreviewEvidence | null {
  return latestEvidence;
}

/** Clears evidence before a rebuild so callers cannot mistake a previous preview for a fresh one. */
export function clearPreviewEvidence(): number {
  latestEvidence = null;
  runtimeErrors = [];
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

  return new Promise((resolve) => {
    let candidate: PreviewEvidence | null = freshEvidence;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const previousListener = listener;
    const finish = (evidence: PreviewEvidence | null) => {
      clearTimeout(timeout);
      if (settleTimer) clearTimeout(settleTimer);
      listener = previousListener;
      resolve(evidence);
    };
    const scheduleFinish = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(candidate), PREVIEW_EVIDENCE_SETTLE_MS);
    };
    const timeout = setTimeout(() => finish(candidate), timeoutMs);
    listener = (evidence) => {
      previousListener?.(evidence);
      if (evidenceRevision <= afterRevision || !evidence) return;
      candidate = evidence;
      if (evidence.screenshotCaptured) scheduleFinish();
    };
    if (candidate?.screenshotCaptured) scheduleFinish();
  });
}

export function setPreviewEvidenceListener(fn: PreviewEvidenceListener) {
  listener = typeof fn === 'function' ? fn : null;
}
