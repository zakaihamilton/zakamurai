import { vi } from 'vitest';

export type MockWorkerInstance = {
  addEventListener: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
  terminate?: ReturnType<typeof vi.fn>;
};

export function createMockWorkerClass(
  factory: () => MockWorkerInstance = () => ({
    addEventListener: vi.fn(),
    postMessage: vi.fn(),
  }),
): typeof Worker {
  return vi.fn(factory) as unknown as typeof Worker;
}
