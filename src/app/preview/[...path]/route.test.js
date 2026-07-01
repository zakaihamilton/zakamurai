import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/preview/[...path] route fallback', () => {
  it('returns a Response with HTML content', async () => {
    const res = await GET(new Request('http://localhost/preview/some/nested/path'));
    expect(res).toBeInstanceOf(Response);
    const text = await res.text();
    expect(text).toContain('Preview Loading');
  });
});
