import { CreateMLCEngine, CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { type Mock, vi } from 'vitest';
import { deleteCachedWebLLMModel, unloadAllWebLLMEngines } from './WebLLMAPI';
import { bindWebLLMStore } from './WebLLMState';

export type MockEngine = {
  chat: { completions: { create: Mock } };
  interruptGenerate: Mock;
  resetChat: Mock;
  interruptSignal: boolean;
  unload?: Mock;
  worker?: { terminate?: Mock };
};

export function createMockWebLLMEngine(): MockEngine {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
    interruptGenerate: vi.fn(),
    resetChat: vi.fn().mockResolvedValue(undefined),
    interruptSignal: false,
  };
}

export async function resetWebLLMTestCase(mockRagUnloadModel: Mock): Promise<MockEngine> {
  await unloadAllWebLLMEngines();
  bindWebLLMStore(null);
  vi.clearAllMocks();
  mockRagUnloadModel.mockResolvedValue(undefined);
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return { terminate: vi.fn() };
    }),
  );

  const mockEngine = createMockWebLLMEngine();
  vi.mocked(CreateMLCEngine).mockResolvedValue(mockEngine as never);
  vi.mocked(CreateWebWorkerMLCEngine).mockResolvedValue(mockEngine as never);
  await deleteCachedWebLLMModel('test-model');
  return mockEngine;
}

export function teardownWebLLMTestCase() {
  bindWebLLMStore(null);
  Reflect.deleteProperty(performance, 'memory');
  vi.useRealTimers();
}
