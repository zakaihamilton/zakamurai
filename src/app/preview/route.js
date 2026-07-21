import { createPreviewLoadingResponse } from './loadingResponse';

/** Fallback while the virtual-preview service worker becomes active. */
export async function GET() {
  return createPreviewLoadingResponse();
}
