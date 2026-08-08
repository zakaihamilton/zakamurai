import { createMockWorkerClass } from '@/test-utils/workerMocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceIndexController } from './index-controller';

type WorkerListener = (event: MessageEvent & ErrorEvent) => void;

describe('WorkspaceIndexController', () => {
  let originalWorker: typeof Worker;
  let listeners: Map<string, WorkerListener>;
  let mockWorker: {
    addEventListener: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    originalWorker = global.Worker;
    listeners = new Map();
    mockWorker = {
      addEventListener: vi.fn((type: string, listener: WorkerListener) => {
        listeners.set(type, listener);
      }),
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    global.Worker = createMockWorkerClass(() => mockWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.Worker = originalWorker;
  });

  it('resolves successful requests and clears their timeout', async () => {
    vi.useFakeTimers();
    const controller = new WorkspaceIndexController();
    const request = controller.queryText('button');
    await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledOnce());

    listeners.get('message')?.({
      data: { id: 1, type: 'SUCCESS', payload: [{ path: 'src/Button.tsx' }] },
    } as MessageEvent & ErrorEvent);

    await expect(request).resolves.toEqual([{ path: 'src/Button.tsx' }]);
    expect(controller.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects every pending request when the worker crashes', async () => {
    const controller = new WorkspaceIndexController();
    const first = controller.queryText('button');
    const second = controller.getHealth();
    await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledTimes(2));

    listeners.get('error')?.({ message: 'worker exploded' } as MessageEvent & ErrorEvent);

    await expect(first).rejects.toThrow('worker exploded');
    await expect(second).rejects.toThrow('worker exploded');
    expect(mockWorker.terminate).toHaveBeenCalledOnce();
    expect(controller.worker).toBeNull();
    expect(controller.pending.size).toBe(0);
  });

  it('terminates and rejects requests that exceed the timeout', async () => {
    vi.useFakeTimers();
    const controller = new WorkspaceIndexController();
    const request = controller.request('HEALTH', {}, 5);
    const rejection = expect(request).rejects.toThrow('HEALTH request timed out after 5ms');
    await vi.advanceTimersByTimeAsync(5);

    await rejection;
    expect(mockWorker.terminate).toHaveBeenCalledOnce();
    expect(controller.worker).toBeNull();
  });

  it('rejects pending requests when disposed', async () => {
    const controller = new WorkspaceIndexController();
    const request = controller.getHealth();
    await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledOnce());

    controller.dispose();

    await expect(request).rejects.toThrow('disposed');
    expect(mockWorker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a postMessage exception and resets the worker', async () => {
    mockWorker.postMessage.mockImplementation(() => {
      throw new Error('clone failed');
    });
    const controller = new WorkspaceIndexController();

    await expect(controller.getHealth()).rejects.toThrow('clone failed');
    expect(mockWorker.terminate).toHaveBeenCalledOnce();
    expect(controller.worker).toBeNull();
  });
});
