import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/preview route fallback', () => {
  it('returns a Response with HTML content', async () => {
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
    const text = await res.text();
    expect(text).toContain('Preview Loading');
  });
});
