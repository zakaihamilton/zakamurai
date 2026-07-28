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
    Settings.setOpenTabs(tabs);
    const savedTabs = Settings.getOpenTabs();
    expect(savedTabs).toHaveLength(1);
    expect(savedTabs[0].id).toBe('1');
  });

  it('gets and sets the last code tab id', () => {
    expect(Settings.getLastCodeTabId()).toBeUndefined();
    Settings.setLastCodeTabId('src/App.js');
    expect(Settings.getLastCodeTabId()).toBe('src/App.js');
    Settings.setLastCodeTabId(null);
    expect(Settings.getLastCodeTabId()).toBeUndefined();
  });

  it('adds to prompt history', () => {
    Settings.addPromptHistory('hello');
    Settings.addPromptHistory('world');
    Settings.addPromptHistory('hello'); // duplicate
    const history = Settings.getPromptHistory();
    expect(history).toEqual(['hello', 'world']);
  });

  it('replaces prompt history via setPromptHistory', () => {
    Settings.setPromptHistory([' one ', 'two', 'one', '', 3, 'three']);
    expect(Settings.getPromptHistory()).toEqual(['one', 'two', 'three']);
    Settings.setPromptHistory([]);
    expect(Settings.getPromptHistory()).toEqual([]);
    Settings.setPromptHistory(null);
    expect(Settings.getPromptHistory()).toEqual([]);
  });

  it('gets, sets, and clears the prompt draft', () => {
    expect(Settings.getPromptDraft()).toBe('');
    Settings.setPromptDraft('unfinished request');
    expect(Settings.getPromptDraft()).toBe('unfinished request');
    Settings.setPromptDraft('');
    expect(Settings.getPromptDraft()).toBe('');
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
    const writePromise = Settings.setFileContents({ stale: true });
    expect(
      Settings.flushEditorBuffersSync(
        { fresh: true },
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

    expect(Settings.getFileContents()).toEqual({ fresh: true });
    expect(JSON.parse(localStorage.getItem('zakamurai_file_contents'))).toEqual({ fresh: true });
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
      globalThis.indexedDB = undefined;
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
      globalThis.indexedDB = undefined;
      resetIdbConnection();

      await expect(Settings.setFileContents(contents)).resolves.toBe(true);
      expect(JSON.parse(localStorage.getItem('zakamurai_file_contents'))).toEqual(contents);
      expect(Settings.getFileContents()).toEqual(contents);
    } finally {
      globalThis.indexedDB = originalIndexedDb;
      resetIdbConnection();
    }
  });

  it('gets and sets active tab id', () => {
    expect(Settings.getActiveTabId()).toBeUndefined();
    Settings.setActiveTabId('src/App.js');
    expect(Settings.getActiveTabId()).toBe('src/App.js');
  });

  it('gets and sets AI logs and truncates to 50 entries', async () => {
    expect(Settings.getAILogs()).toEqual([]);
    const logs = Array.from({ length: 55 }, (_, index) => ({ id: index }));
    await Settings.setAILogs(logs);
    expect(Settings.getAILogs()).toHaveLength(50);
    expect(Settings.getAILogs()[0].id).toBe(5);
    expect(Settings.getAILogs()[49].id).toBe(54);
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
    Settings.addPromptHistory(null);
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
});
