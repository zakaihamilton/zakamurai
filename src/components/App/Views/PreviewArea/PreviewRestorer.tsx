import { AppState } from '@/components/App/AppState';
import { PreviewState } from '@/components/App/PreviewState';
import { useEffect, useRef } from 'react';
import { requireStore } from '../../types';

/**
 * On reload, saved preview HTML alone is not enough — bundled /dist/assets are gone.
 * Trigger a silent recompile on reload so preview rebuilds automatically without manual user action.
 */
export function usePreviewRestorer() {
  const previewState = requireStore(
    PreviewState.useState(['htmlContent', 'isCompilerReady', 'restoreError']),
  );
  const appState = requireStore(AppState.useState(['silentCompileRequest']));
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
      draft.restoreError = null;
    });

    appState((draft) => {
      draft.silentCompileRequest = (draft.silentCompileRequest || 0) + 1;
    });
  }, [htmlContent, previewState, appState]);
}
