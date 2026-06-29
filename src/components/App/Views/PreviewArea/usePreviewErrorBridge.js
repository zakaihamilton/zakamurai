import { PreviewState } from '@/components/App/PreviewState';
import { setPreviewErrorListener } from '@/components/App/Views/PreviewArea/previewErrorBridge';
import { useEffect } from 'react';

export function usePreviewErrorBridge() {
  const previewState = PreviewState.useState();

  useEffect(() => {
    setPreviewErrorListener((message) => {
      previewState((draft) => {
        draft.serverError = message;
      });
    });
    return () => setPreviewErrorListener(null);
  }, [previewState]);
}
