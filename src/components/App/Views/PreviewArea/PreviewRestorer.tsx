import { PreviewState } from '@/components/App/PreviewState';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

/**
 * Saved preview HTML does not preserve the compiler's in-memory /dist assets.
 * Leave rebuilding to the user instead of starting a build automatically on reload.
 */
export function usePreviewRestorer() {
  const previewState = requireStore(
    PreviewState.useState(['htmlContent', 'isCompilerReady', 'restoreError']),
  );
  const { htmlContent } = previewState;
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (!htmlContent) {
      previewState((draft) => {
        draft.isCompilerReady = false;
        draft.restoreError = null;
      });
      return;
    }

    previewState((draft) => {
      draft.isCompilerReady = false;
      draft.restoreError =
        'The saved preview needs a new build after reload. Select Build to restore it.';
    });
  }, [htmlContent, previewState]);
}
