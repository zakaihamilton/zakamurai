import { describe, expect, it, vi } from 'vitest';
import UiPreviewPage from './page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('./preview', () => ({ default: () => null }));

describe('UI preview route', () => {
  it('is unavailable outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => UiPreviewPage()).toThrow('not found');
    vi.unstubAllEnvs();
  });
  it('is available in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(UiPreviewPage()).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
