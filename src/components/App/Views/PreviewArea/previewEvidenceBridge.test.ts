import type { PreviewEvidence } from './preview-types';
import { describe, expect, it, vi } from 'vitest';
import {
  getLatestPreviewEvidence,
  reportPreviewEvidence,
  setPreviewEvidenceListener,
} from './previewEvidenceBridge';

describe('previewEvidenceBridge', () => {
  it('reports, stores, and notifies listeners of preview evidence', () => {
    const listener = vi.fn();
    setPreviewEvidenceListener(listener);

    const evidence: PreviewEvidence = { text: 'Failed to load script' };
    reportPreviewEvidence(evidence);
    expect(getLatestPreviewEvidence()).toEqual(evidence);
    expect(listener).toHaveBeenCalledWith(evidence);

    reportPreviewEvidence(null as unknown as PreviewEvidence);
    expect(getLatestPreviewEvidence()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);

    setPreviewEvidenceListener(null);
    const secondEvidence: PreviewEvidence = { text: 'Second error' };
    reportPreviewEvidence(secondEvidence);
    expect(getLatestPreviewEvidence()).toEqual(secondEvidence);
  });
});
