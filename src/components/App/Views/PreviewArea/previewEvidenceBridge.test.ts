import { describe, expect, it, vi } from 'vitest';
import type { PreviewEvidence } from './preview-types';
import {
  clearPreviewEvidence,
  getLatestPreviewEvidence,
  reportPreviewEvidence,
  setPreviewEvidenceListener,
  waitForPreviewEvidence,
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

  it('waits for evidence reported after the requested rebuild', async () => {
    const afterRevision = clearPreviewEvidence();
    const pending = waitForPreviewEvidence(afterRevision, 100);
    reportPreviewEvidence({ text: 'fresh DOM', screenshotCaptured: false });
    reportPreviewEvidence({ text: 'fresh DOM', screenshotCaptured: true });

    await expect(pending).resolves.toEqual({ text: 'fresh DOM', screenshotCaptured: true });
  });

  it('retains already-reported fresh DOM evidence when screenshot capture is unavailable', async () => {
    const afterRevision = clearPreviewEvidence();
    reportPreviewEvidence({ text: 'fresh DOM', screenshotCaptured: false });

    await expect(waitForPreviewEvidence(afterRevision, 0)).resolves.toEqual({
      text: 'fresh DOM',
      screenshotCaptured: false,
    });
  });
});
