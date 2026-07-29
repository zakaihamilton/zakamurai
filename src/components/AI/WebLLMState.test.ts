import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindWebLLMStore,
  getWebLLMStore,
  setWebLLMCachedModelIds,
  updateWebLLMEngine,
} from './WebLLMState';

describe('WebLLMState helpers', () => {
  beforeEach(() => {
    bindWebLLMStore(null);
  });

  it('bindWebLLMStore / getWebLLMStore round-trip', () => {
    const store = vi.fn();
    bindWebLLMStore(store);
    expect(getWebLLMStore()).toBe(store);
    bindWebLLMStore(null);
    expect(getWebLLMStore()).toBeNull();
  });

  it('updateWebLLMEngine no-ops without a store or model id', () => {
    expect(() => updateWebLLMEngine('m1', { status: 'ready' })).not.toThrow();
    bindWebLLMStore(vi.fn());
    expect(() => updateWebLLMEngine('', { status: 'ready' })).not.toThrow();
  });

  it('updateWebLLMEngine merges engine patches and sets activeModelId', () => {
    const draft = { engines: undefined, activeModelId: null };
    const store = vi.fn((producer) => producer(draft));
    bindWebLLMStore(store);

    updateWebLLMEngine('m1', { status: 'downloading', progressText: '10%' });
    expect(draft.engines.m1).toEqual({
      status: 'downloading',
      progressText: '10%',
    });
    expect(draft.activeModelId).toBe('m1');

    updateWebLLMEngine('m1', { status: 'ready', generating: false });
    expect(draft.engines.m1.status).toBe('ready');
    expect(draft.activeModelId).toBe('m1');

    updateWebLLMEngine('m1', { generating: true });
    expect(draft.activeModelId).toBe('m1');
  });

  it('setWebLLMCachedModelIds updates cachedModelIds', () => {
    const draft = { cachedModelIds: [] };
    const store = vi.fn((producer) => producer(draft));
    bindWebLLMStore(store);

    setWebLLMCachedModelIds(['a', 'b']);
    expect(draft.cachedModelIds).toEqual(['a', 'b']);

    setWebLLMCachedModelIds(null);
    expect(draft.cachedModelIds).toEqual([]);
  });

  it('setWebLLMCachedModelIds no-ops without a store', () => {
    expect(() => setWebLLMCachedModelIds(['a'])).not.toThrow();
  });
});
