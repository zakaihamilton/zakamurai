import { vi } from 'vitest';

export type MockFetchResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: Headers;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export function makeFetchResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string; headers?: Record<string, string> } = {},
): MockFetchResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: new Headers(init.headers),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

export function mockGlobalFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<MockFetchResponse>,
): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

export function restoreGlobalFetch(): void {
  vi.unstubAllGlobals();
}
