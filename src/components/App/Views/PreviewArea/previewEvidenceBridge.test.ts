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

    reportPreviewEvidence({ error: 'Failed to load script' });
    expect(getLatestPreviewEvidence()).toEqual({ error: 'Failed to load script' });
    expect(listener).toHaveBeenCalledWith({ error: 'Failed to load script' });

    reportPreviewEvidence(null);
    expect(getLatestPreviewEvidence()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);

    setPreviewEvidenceListener(null);
    reportPreviewEvidence({ error: 'Second error' });
    expect(getLatestPreviewEvidence()).toEqual({ error: 'Second error' });
  });
});
