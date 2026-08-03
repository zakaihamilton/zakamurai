import * as Diagnostics from '@/components/Diagnostics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import { idbClear, idbSet, isIdbAvailable, resetIdbConnection } from './idbStore';

function stubFailingLocalStorage() {
  const storage = localStorage;
  vi.stubGlobal('localStorage', {
    getItem: storage.getItem.bind(storage),
    setItem: () => {
      throw new DOMException('QuotaExceededError');
    },
    removeItem: storage.removeItem.bind(storage),
    clear: storage.clear.bind(storage),
  });
}

describe('Settings', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    Settings._resetHydrationForTests();
    resetIdbConnection();
    await idbClear();
    await Settings.hydrate();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await Settings.reset();
    Settings._resetHydrationForTests();
    resetIdbConnection();
  });

  it('gets and sets project name', () => {
    expect(Settings.getProjectName('Default')).toBe('Default');
    Settings.setProjectName('New Project');
    expect(Settings.getProjectName()).toBe('New Project');
  });

  it('gets and sets theme', () => {
    expect(Settings.getTheme('dark')).toBe('dark');
    Settings.setTheme('light');
    expect(Settings.getTheme()).toBe('light');
  });

  it('gets and sets open tabs', () => {
    const tabs = [{ id: '1', type: 'file', label: 'test.js' }];
    Settings.setOpenTabs(tabs as never);
    const savedTabs = Settings.getOpenTabs();
    expect(savedTabs).toHaveLength(1);
    expect(savedTabs?.[0].id).toBe('1');
  });

  it('gets and sets the last code tab id', () => {
    expect(Settings.getLastCodeTabId()).toBeNull();
    Settings.setLastCodeTabId('src/App.js');
    expect(Settings.getLastCodeTabId()).toBe('src/App.js');
    Settings.setLastCodeTabId(null);
    expect(Settings.getLastCodeTabId()).toBeNull();
  });

  it('adds to prompt history', () => {
    Settings.addPromptHistory('hello');
    Settings.addPromptHistory('world');
    Settings.addPromptHistory('hello'); // duplicate
    const history = Settings.getPromptHistory();
    expect(history).toEqual(['hello', 'world']);
  });

  it('replaces prompt history via setPromptHistory', () => {
    Settings.setPromptHistory([' one ', 'two', 'one', '', 'three']);
    expect(Settings.getPromptHistory()).toEqual(['one', 'two', 'three']);
    Settings.setPromptHistory([]);
    expect(Settings.getPromptHistory()).toEqual([]);
    Settings.setPromptHistory([] as never);
    expect(Settings.getPromptHistory()).toEqual([]);
  });

  it('gets, sets, and clears the prompt draft', () => {
    expect(Settings.getPromptDraft()).toBe('');
    Settings.setPromptDraft('unfinished request');
    expect(Settings.getPromptDraft()).toBe('unfinished request');
    Settings.setPromptDraft('');
    expect(Settings.getPromptDraft()).toBe('');
  });

  it('gets, sets, and clears the welcome prompt draft', () => {
    expect(Settings.getWelcomePromptDraft()).toBe('');
    Settings.setWelcomePromptDraft('build a game');
    expect(Settings.getWelcomePromptDraft()).toBe('build a game');
    Settings.setWelcomePromptDraft('');
    expect(Settings.getWelcomePromptDraft()).toBe('');
  });

  it('gets and sets validated pending diffs in IndexedDB-backed cache', async () => {
    const pendingDiffs = {
      'src/App.js': {
        originalContent: 'old',
        modifiedContent: 'new',
        diffs: [{ start: 0, end: 3, origStart: 0, origEnd: 3, original: 'old', updated: 'new' }],
      },
    };
    await expect(Settings.setPendingDiffs(pendingDiffs)).resolves.toBe(true);
    expect(Settings.getPendingDiffs()).toEqual(pendingDiffs);
    await Settings.setPendingDiffs({});
    expect(Settings.getPendingDiffs()).toEqual({});
  });

  it('gets and sets pending deletions and preserves them through hydration', async () => {
    const pendingDeletions = {
      'old.js': { originalContent: 'gone', changeSetId: 'cs-1' },
      'flagged.js': true,
    };
    await expect(Settings.setPendingDeletions(pendingDeletions)).resolves.toBe(true);
    expect(Settings.getPendingDeletions()).toEqual(pendingDeletions);

    Settings._resetHydrationForTests();
    await Settings.hydrate();
    expect(Settings.getPendingDeletions()).toEqual(pendingDeletions);

    await Settings.setPendingDeletions({ invalid: { originalContent: 1 } } as never);
    expect(Settings.getPendingDeletions()).toEqual({});
  });

  it('migrates legacy localStorage pending diffs on hydrate', async () => {
    Settings._resetHydrationForTests();
    await idbClear();
    resetIdbConnection();
    localStorage.setItem('zakamurai_pending_diffs', '{bad json');
    await Settings.hydrate();
    expect(Settings.getPendingDiffs()).toEqual({});

    Settings._resetHydrationForTests();
    await idbClear();
    resetIdbConnection();
    localStorage.setItem('zakamurai_pending_diffs', JSON.stringify({ bad: { diffs: [] } }));
    await Settings.hydrate();
    expect(Settings.getPendingDiffs()).toEqual({});
  });

  it('gets and sets agent sessions', async () => {
    expect(Settings.getAgentSessions()).toBeNull();
    const payload = {
      activeSessionId: 's1',
      sessions: {
        s1: { id: 's1', name: 'Agent 1', mode: 'single', messages: [] },
      },
    };
    await expect(Settings.setAgentSessions(payload)).resolves.toBe(true);
    expect(Settings.getAgentSessions()).toEqual(payload);
    Settings.setActiveAgentSessionId('s1');
    expect(Settings.getActiveAgentSessionId()).toBe('s1');
  });

  it('persists file contents via IndexedDB or durable localStorage fallback', async () => {
    await expect(Settings.setFileContents({ 'a.js': 'code' })).resolves.toBe(true);
    expect(Settings.getFileContents()).toEqual({ 'a.js': 'code' });
    expect(['healthy', 'fallback']).toContain(Settings.getStorageHealth().status);
  });

  it('hydrate prefers unload localStorage over older IndexedDB', async () => {
    // Seed a stale IDB/memory blob, then a fresher beforeunload localStorage copy.
    await idbSet('zakamurai_file_contents', { fromIdb: true });
    localStorage.setItem('zakamurai_file_contents', JSON.stringify({ fromUnload: true }));
    Settings._resetHydrationForTests();

    await Settings.hydrate();
    expect(Settings.getFileContents()).toEqual({ fromUnload: true });

    if (isIdbAvailable()) {
      // Durable promotion clears the legacy slot.
      expect(localStorage.getItem('zakamurai_file_contents')).toBeNull();
    }
  });

  it('hydrate reads IndexedDB when localStorage has no legacy copy', async () => {
    await idbSet('zakamurai_file_contents', { onlyIdb: true });
    localStorage.removeItem('zakamurai_file_contents');
    Settings._resetHydrationForTests();

    await Settings.hydrate();
    expect(Settings.getFileContents()).toEqual({ onlyIdb: true });
  });

  it('recovers a valid workspace checkpoint when primary buffers are unavailable', async () => {
    await Settings.saveRecoveryCheckpoint({
      projectName: 'Recovered project',
      fileContents: { 'src/App.js': 'export default 1;' },
      pendingDiffs: {},
      openTabs: [],
      activeTabId: 'src/App.js',
    });
    Settings._resetHydrationForTests();
    await Settings.hydrate();

    expect(Settings.getFileContents()).toEqual({ 'src/App.js': 'export default 1;' });
    expect(Settings.getRecoveryCheckpoint()?.projectName).toBe('Recovered project');
  });

  it('protects explicit AI checkpoints from automatic persistence overwrites', async () => {
    await Settings.saveRecoveryCheckpoint({
      reason: 'ai-change',
      projectName: 'Before AI',
      fileContents: { 'src/App.js': 'before' },
      pendingDiffs: {},
      pendingDeletions: {},
      openTabs: [],
      activeTabId: null,
    });
    Settings._resetHydrationForTests();
    await Settings.hydrate();

    await Settings.saveRecoveryCheckpoint({
      reason: 'storage-recovery',
      projectName: 'After AI',
      fileContents: { 'src/App.js': 'after' },
      pendingDiffs: {},
      pendingDeletions: {},
      openTabs: [],
      activeTabId: null,
    });

    expect(Settings.getRecoveryCheckpoint()).toMatchObject({
      reason: 'ai-change',
      projectName: 'Before AI',
      fileContents: { 'src/App.js': 'before' },
    });
  });

  it('flushes editor buffers synchronously for unload', () => {
    expect(
      Settings.flushEditorBuffersSync(
        { 'a.js': 'code' },
        {
          'a.js': {
            originalContent: 'old',
            modifiedContent: 'code',
            diffs: [{ start: 0, end: 1, origStart: 0, origEnd: 1 }],
          },
        },
      ),
    ).toBe(true);
    expect(Settings.getFileContents()).toEqual({ 'a.js': 'code' });
    expect(localStorage.getItem('zakamurai_file_contents')).toContain('a.js');
  });

  it('does not let an in-flight durable write clear a newer unload snapshot', async () => {
    const writePromise = Settings.setFileContents({ stale: 'true' });
    expect(
      Settings.flushEditorBuffersSync(
        { fresh: 'true' },
        {
          'a.js': {
            originalContent: 'old',
            modifiedContent: 'fresh',
            diffs: [{ start: 0, end: 1, origStart: 0, origEnd: 1 }],
          },
        },
      ),
    ).toBe(true);

    await writePromise;

    expect(Settings.getFileContents()).toEqual({ fresh: 'true' });
    expect(JSON.parse(localStorage.getItem('zakamurai_file_contents') ?? '{}')).toEqual({
      fresh: 'true',
    });
  });

  it('gets and sets sidebar width', () => {
    expect(Settings.getSidebarWidth(260)).toBe(260);
    Settings.setSidebarWidth(300);
    expect(Settings.getSidebarWidth()).toBe(300);
  });

  it('gets and sets AI completion enabled', () => {
    expect(Settings.getAICompletionEnabled(true)).toBe(true);
    Settings.setAICompletionEnabled(false);
    expect(Settings.getAICompletionEnabled()).toBe(false);
    Settings.setAICompletionEnabled(true);
    expect(Settings.getAICompletionEnabled()).toBe(true);
  });

  it('gets and sets AI prompt model', () => {
    expect(Settings.getAIPromptModel('default-model')).toBe('default-model');
    Settings.setAIPromptModel('Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC');
    expect(Settings.getAIPromptModel()).toBe('Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC');
  });

  it('gets and sets editor read only mode', () => {
    expect(Settings.getEditorReadOnly(false)).toBe(false);
    Settings.setEditorReadOnly(true);
    expect(Settings.getEditorReadOnly()).toBe(true);
    Settings.setEditorReadOnly(false);
    expect(Settings.getEditorReadOnly()).toBe(false);
  });

  it('returns false and warns when a localStorage write fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFailingLocalStorage();

    expect(Settings.set('zakamurai_file_contents', 'x')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('keeps file contents in memory when IndexedDB and localStorage both fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalIndexedDb = globalThis.indexedDB;
    const contents = { 'a.js': 'code' };

    try {
      globalThis.indexedDB = undefined as unknown as IDBFactory;
      resetIdbConnection();
      stubFailingLocalStorage();

      await expect(Settings.setFileContents(contents)).resolves.toBe(false);
      expect(Settings.getFileContents()).toEqual(contents);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      globalThis.indexedDB = originalIndexedDb;
      resetIdbConnection();
    }
  });

  it('uses localStorage when IndexedDB is unavailable', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const contents = { 'a.js': 'fallback code' };

    try {
      globalThis.indexedDB = undefined as unknown as IDBFactory;
      resetIdbConnection();

      await expect(Settings.setFileContents(contents)).resolves.toBe(true);
      expect(JSON.parse(localStorage.getItem('zakamurai_file_contents') ?? '{}')).toEqual(contents);
      expect(Settings.getFileContents()).toEqual(contents);
    } finally {
      globalThis.indexedDB = originalIndexedDb;
      resetIdbConnection();
    }
  });

  it('gets and sets active tab id', () => {
    expect(Settings.getActiveTabId()).toBeNull();
    Settings.setActiveTabId('src/App.js');
    expect(Settings.getActiveTabId()).toBe('src/App.js');
  });

  it('gets and sets AI logs and truncates to 1,000 entries', async () => {
    expect(Settings.getAILogs()).toEqual([]);
    const logs = Array.from({ length: 1005 }, (_, index) => ({
      id: index,
      role: 'system',
      text: `log ${index}`,
      timestamp: '00:00',
    }));
    await Settings.setAILogs(logs);
    expect(Settings.getAILogs()).toHaveLength(1000);
    expect(Settings.getAILogs()[0].id).toBe(5);
    expect(Settings.getAILogs()[999].id).toBe(1004);
  });

  it('gets and sets preview html', async () => {
    expect(Settings.getPreviewHtml()).toBeNull();
    await Settings.setPreviewHtml('<html></html>');
    expect(Settings.getPreviewHtml()).toBe('<html></html>');
    await Settings.setPreviewHtml(null);
    expect(Settings.getPreviewHtml()).toBeNull();
  });

  it('gets and sets prompt width', () => {
    expect(Settings.getPromptWidth(360)).toBe(360);
    Settings.setPromptWidth(400);
    expect(Settings.getPromptWidth()).toBe(400);
  });

  it('gets and sets sidebar open state', () => {
    expect(Settings.getIsSidebarOpen()).toBe(false);
    expect(Settings.getIsSidebarOpen(true)).toBe(true);
    Settings.setIsSidebarOpen(false);
    expect(Settings.getIsSidebarOpen()).toBe(false);
    Settings.setIsSidebarOpen(true);
    expect(Settings.getIsSidebarOpen()).toBe(true);
  });

  it('gets and sets show AI input defaulting to false', () => {
    expect(Settings.getShowAIInput()).toBe(false);
    expect(Settings.getShowAIInput(true)).toBe(true);
    Settings.setShowAIInput(true);
    expect(Settings.getShowAIInput()).toBe(true);
    Settings.setShowAIInput(false);
    expect(Settings.getShowAIInput()).toBe(false);
  });

  it('gets and sets expanded folders and handles corrupt JSON', () => {
    expect(Settings.getExpandedFolders()).toEqual({});
    Settings.setExpandedFolders({ src: true });
    expect(Settings.getExpandedFolders()).toEqual({ src: true });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('zakamurai_expanded_folders', '{bad');
    expect(Settings.getExpandedFolders()).toEqual({});
    expect(errorSpy).toHaveBeenCalled();
  });

  it('gets and sets AI model expanded state and handles corrupt JSON', () => {
    expect(Settings.getAIModelExpanded()).toEqual({});
    Settings.setAIModelExpanded({ model1: true });
    expect(Settings.getAIModelExpanded()).toEqual({ model1: true });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('zakamurai_ai_model_expanded', '{bad');
    expect(Settings.getAIModelExpanded()).toEqual({});
    expect(errorSpy).toHaveBeenCalled();
  });

  it('gets and sets template', () => {
    expect(Settings.getTemplate('default')).toBe('default');
    Settings.setTemplate('react');
    expect(Settings.getTemplate()).toBe('react');
  });

  it('refreshes storage health and warns when quota is at least 80% full', async () => {
    const diagnosticSpy = vi.spyOn(Diagnostics, 'reportDiagnostic').mockImplementation(() => {});

    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 8500, quota: 10000 }),
      },
    });

    const health = await Settings.refreshStorageHealth();
    expect(health.quotaWarning).toBe(true);
    expect(health.usage).toBe(8500);
    expect(health.quota).toBe(10000);
    expect(diagnosticSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'storage',
        severity: 'warning',
        message: 'Browser storage is at least 80% full.',
      }),
    );
  });

  it('does not add empty or whitespace prompt history entries', () => {
    Settings.addPromptHistory('');
    Settings.addPromptHistory('   ');
    Settings.addPromptHistory(null as never);
    expect(Settings.getPromptHistory()).toEqual([]);
  });

  it('returns empty array for corrupt prompt history JSON', () => {
    localStorage.setItem('zakamurai_prompt_history', '{bad');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(Settings.getPromptHistory()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('clears agent sessions when set to null', async () => {
    await Settings.setAgentSessions({
      activeSessionId: 's1',
      sessions: { s1: { id: 's1', name: 'Agent 1', mode: 'single', messages: [] } },
    });
    expect(Settings.getAgentSessions()).not.toBeNull();
    await Settings.setAgentSessions(null);
    expect(Settings.getAgentSessions()).toBeNull();
  });

  it('returns default when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(Settings.get('zakamurai-theme', 'dark')).toBe('dark');
  });

  it('gets and sets workspace profile', () => {
    expect(Settings.getWorkspaceProfile()).toEqual({});
    Settings.setWorkspaceProfile({ name: 'demo', stack: ['react'] });
    expect(Settings.getWorkspaceProfile()).toEqual({ name: 'demo', stack: ['react'] });
  });

  it('gets and sets change sets via IndexedDB-backed cache', async () => {
    const changeSets = {
      activeId: 'cs-1',
      items: [{ id: 'cs-1', label: 'Initial', createdAt: 1, files: [] }],
    };
    await Settings.setChangeSets(changeSets as never);
    expect(Settings.getChangeSets()).toEqual(changeSets);
    await Settings.setChangeSets(null);
    expect(Settings.getChangeSets()).toEqual({ activeId: null, items: [] });
  });

  it('gets and sets the active agent session id', () => {
    expect(Settings.getActiveAgentSessionId()).toBeNull();
    Settings.setActiveAgentSessionId('session-42');
    expect(Settings.getActiveAgentSessionId()).toBe('session-42');
    Settings.setActiveAgentSessionId(null);
    expect(Settings.getActiveAgentSessionId()).toBeNull();
  });

  it('resets persisted settings to the scratch template', async () => {
    Settings.setProjectName('Custom Project');
    Settings.setTemplate('default');
    await Settings.reset('scratch');
    expect(Settings.getTemplate()).toBe('scratch');
    expect(Settings.getProjectName()).toBe('My App');
  });

  it('can preserve the active theme while resetting a project', async () => {
    Settings.setTheme('light');
    await Settings.reset('default', { preserveTheme: 'light' });
    expect(Settings.getTheme()).toBe('light');
  });

  it('preserves the selected AI prompt model while resetting a project', async () => {
    Settings.setAIPromptModel('Qwen3.5-4B-q4f16_1-MLC');
    Settings.setWelcomePromptDraft('build a game');
    await Settings.reset('scratch', {
      preserveAIPromptModel: 'Qwen3.5-4B-q4f16_1-MLC',
      preserveWelcomePrompt: 'build a game',
    });
    expect(Settings.getAIPromptModel()).toBe('Qwen3.5-4B-q4f16_1-MLC');
    expect(Settings.getWelcomePromptDraft()).toBe('build a game');
  });

  it('reports storage health and quota warnings', async () => {
    const health = Settings.getStorageHealth();
    expect(health.status).toBeTruthy();
    await Settings.refreshStorageHealth();
    expect(Settings.getStorageHealth().status).toBeTruthy();
  });

  it('returns defaults when localStorage methods are missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: undefined,
      setItem: undefined,
      removeItem: undefined,
    });
    expect(Settings.get('zakamurai-theme', 'dark')).toBe('dark');
    expect(Settings.set('zakamurai-theme', 'light')).toBe(false);
  });

  it('returns false from set when removeItem throws for null values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: localStorage.getItem.bind(localStorage),
      setItem: localStorage.setItem.bind(localStorage),
      removeItem: () => {
        throw new Error('remove failed');
      },
      clear: localStorage.clear.bind(localStorage),
    });
    expect(Settings.set('zakamurai-theme', null)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null for corrupt open tabs JSON', () => {
    localStorage.setItem('zakamurai_open_tabs', '{bad');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(Settings.getOpenTabs()).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('normalizes invalid file contents payloads to an empty object', async () => {
    await expect(Settings.setFileContents(null)).resolves.toBe(true);
    expect(Settings.getFileContents()).toEqual({});
    await expect(Settings.setFileContents('bad' as never)).resolves.toBe(true);
    expect(Settings.getFileContents()).toEqual({});
  });

  it('returns an empty workspace profile for non-object stored values', () => {
    localStorage.setItem('zakamurai_workspace_profile', JSON.stringify(['not', 'an', 'object']));
    expect(Settings.getWorkspaceProfile()).toEqual({});
  });

  it('returns false when recovery checkpoint persistence fails', async () => {
    const diagnosticSpy = vi.spyOn(Diagnostics, 'reportDiagnostic').mockImplementation(() => {});
    const originalIndexedDb = globalThis.indexedDB;
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    resetIdbConnection();

    const saved = await Settings.saveRecoveryCheckpoint({
      projectName: 'Broken checkpoint',
      fileContents: { 'src/App.js': 'export default 1;' },
      pendingDiffs: {},
      openTabs: [],
      activeTabId: 'src/App.js',
    });

    expect(saved).toBe(false);
    expect(Settings.getRecoveryCheckpoint()?.projectName).toBe('Broken checkpoint');
    expect(diagnosticSpy).toHaveBeenCalled();
    globalThis.indexedDB = originalIndexedDb;
    resetIdbConnection();
  });

  it('reuses the in-flight hydrate promise and short-circuits when already hydrated', async () => {
    Settings._resetHydrationForTests();
    const first = Settings.hydrate();
    const second = Settings.hydrate();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    await expect(Settings.hydrate()).resolves.toBe(true);
    expect(Settings.isHydrated()).toBe(true);
  });

  it('recovers from hydrate failures with empty defaults', async () => {
    const idbStore = await import('./idbStore');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(idbStore, 'idbGet').mockRejectedValueOnce(new Error('idb read failed'));
    Settings._resetHydrationForTests();

    await expect(Settings.hydrate()).resolves.toBe(false);
    expect(Settings.isHydrated()).toBe(true);
    expect(Settings.getFileContents()).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('ignores storage estimate failures during health refresh', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockRejectedValue(new Error('estimate unavailable')),
      },
    });
    const health = await Settings.refreshStorageHealth();
    expect(health.status).toBeTruthy();
  });

  it('normalizes invalid change set payloads', async () => {
    await Settings.setChangeSets({ activeId: 'cs-1', items: 'bad' as never });
    expect(Settings.getChangeSets()).toEqual({ activeId: 'cs-1', items: [] });
  });

  it('returns empty AI logs when cache is corrupted', async () => {
    await Settings.setAILogs([{ id: 1, role: 'system', text: 'hello', timestamp: '00:00' }]);
    Settings._resetHydrationForTests();
    localStorage.setItem('zakamurai_ai_logs', JSON.stringify('not-an-array'));
    await Settings.hydrate();
    expect(Settings.getAILogs()).toEqual([]);
  });
});
