import { describe, expect, it, vi } from 'vitest';
import { IndexerController } from './indexer-controller.js';

describe('IndexerController', () => {
  it('debounces multiple file changes for the same file', async () => {
    vi.useFakeTimers();
    const controller = new IndexerController();

    // Mock the processFile to just be a spy
    controller.processFile = vi.fn();

    // Create mock records representing multiple rapid edits to the same file
    const records = [
      {
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' },
        relativePathComponents: ['test.js'],
      },
      {
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' },
        relativePathComponents: ['test.js'],
      },
    ];

    await controller.handleFileChanges(records);

    // Should not have been called yet because of the 750ms debounce
    expect(controller.processFile).not.toHaveBeenCalled();

    // Fast forward time past debounce
    vi.advanceTimersByTime(800);

    // Should only be called once despite multiple events
    expect(controller.processFile).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
