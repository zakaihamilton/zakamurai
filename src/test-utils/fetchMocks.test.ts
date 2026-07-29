import { afterEach, describe, expect, it, vi } from 'vitest';
import { asFetchImpl, makeFetchResponse, mockGlobalFetch, restoreGlobalFetch } from './fetchMocks';

describe('fetchMocks', () => {
  afterEach(() => {
    restoreGlobalFetch();
  });

  describe('makeFetchResponse', () => {
    it('builds a response from an object body with defaults', async () => {
      const response = makeFetchResponse({ hello: 'world' });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(response.headers).toBeInstanceOf(Headers);
      await expect(response.json?.()).resolves.toEqual({ hello: 'world' });
      await expect(response.text?.()).resolves.toBe('{"hello":"world"}');
      const buffer = await response.arrayBuffer?.();
      expect(new TextDecoder().decode(buffer)).toBe('{"hello":"world"}');
    });

    it('builds a response from a string body and custom init', async () => {
      const response = makeFetchResponse('plain text', {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { 'x-test': '1' },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(response.statusText).toBe('Not Found');
      expect(response.headers?.get('x-test')).toBe('1');
      await expect(response.text?.()).resolves.toBe('plain text');
      await expect(response.json?.()).rejects.toThrow();
    });
  });

  describe('mockGlobalFetch', () => {
    it('stubs global fetch and can be restored', async () => {
      const impl = vi.fn(async () => makeFetchResponse({ ok: true }));
      mockGlobalFetch(impl);

      const result = await global.fetch('https://example.com/test');
      expect(impl).toHaveBeenCalledWith('https://example.com/test');
      await expect(result.json()).resolves.toEqual({ ok: true });

      restoreGlobalFetch();
      expect(global.fetch).not.toBe(impl);
    });
  });

  describe('asFetchImpl', () => {
    it('wraps an async implementation as fetch', async () => {
      const impl = vi.fn(async (input: RequestInfo | URL) =>
        makeFetchResponse({ url: String(input) }),
      );
      const fetchImpl = asFetchImpl(impl);

      const response = await fetchImpl('https://example.com/resource', { method: 'GET' });
      expect(impl).toHaveBeenCalledWith('https://example.com/resource', { method: 'GET' });
      await expect(response.json()).resolves.toEqual({ url: 'https://example.com/resource' });
    });
  });
});
