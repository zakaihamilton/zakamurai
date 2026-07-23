import { describe, expect, it } from 'vitest';
import { createPreviewLoadingResponse } from './loadingResponse';

describe('createPreviewLoadingResponse', () => {
  it('returns HTML that waits for the preview service worker', async () => {
    const response = createPreviewLoadingResponse();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toMatch(/no-store/);

    const html = await response.text();
    expect(html).toContain('Preview Loading');
    expect(html).toContain('serviceWorker');
    expect(html).toContain('controllerchange');
  });

  it('guards serviceWorker access for opaque sandboxed iframes', async () => {
    const html = await createPreviewLoadingResponse().text();
    expect(html).toContain('getServiceWorker');
    expect(html).toMatch(/try\s*\{[\s\S]*serviceWorker[\s\S]*\}\s*catch/);
    expect(html).toContain('Sandbox preview');
    expect(html).toContain('_preview_wait');
  });
});
