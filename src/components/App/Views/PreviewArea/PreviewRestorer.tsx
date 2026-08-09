import { PreviewState } from '@/components/App/PreviewState';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

/**
 * A saved preview is stale after a reload because the in-memory compiler is gone.
 * Leave it visible as needing a user-initiated build instead of compiling on startup.
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

    previewState((draft) => {
      draft.isCompilerReady = true;
      draft.restoreError = htmlContent
        ? 'Preview needs to be rebuilt after reloading. Build the project to start it.'
        : null;
    });
  }, [htmlContent, previewState]);
}
