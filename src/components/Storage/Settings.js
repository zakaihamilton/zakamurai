import { idbClear, idbGet, idbSet } from './idbStore';

const KEYS = {
  PROJECT_NAME: 'zakamurai_project_name',
  THEME: 'zakamurai-theme',
  OPEN_TABS: 'zakamurai_open_tabs',
  ACTIVE_TAB_ID: 'zakamurai_active_tab_id',
  LAST_CODE_TAB_ID: 'zakamurai_last_code_tab_id',
  PROMPT_HISTORY: 'zakamurai_prompt_history',
  PROMPT_DRAFT: 'zakamurai_prompt_draft',
  FILE_CONTENTS: 'zakamurai_file_contents',
  PENDING_DIFFS: 'zakamurai_pending_diffs',
  AI_LOGS: 'zakamurai_ai_logs',
  PREVIEW_HTML: 'zakamurai_preview_html',
  SIDEBAR_WIDTH: 'zakamurai_sidebar_width',
  PROMPT_WIDTH: 'zakamurai_prompt_width',
  IS_SIDEBAR_OPEN: 'zakamurai_is_sidebar_open',
  SHOW_AI_INPUT: 'zakamurai_show_ai_input',
  EXPANDED_FOLDERS: 'zakamurai_expanded_folders',
  AI_COMPLETION_ENABLED: 'zakamurai_ai_completion_enabled',
  AI_PROMPT_MODEL: 'zakamurai_ai_prompt_model',
  AI_MODEL_EXPANDED: 'zakamurai_ai_model_expanded',
  TEMPLATE: 'zakamurai_template',
  EDITOR_READ_ONLY: 'zakamurai_editor_read_only',
  AGENT_SESSIONS: 'zakamurai_agent_sessions',
  ACTIVE_AGENT_SESSION: 'zakamurai_active_agent_session',
};

const getStorage = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  if (
    typeof localStorage.getItem !== 'function' ||
    typeof localStorage.setItem !== 'function' ||
    typeof localStorage.removeItem !== 'function'
  ) {
    return null;
  }

  return localStorage;
};

/** Keys stored primarily in IndexedDB (too large for reliable localStorage). */
const LARGE_IDB_KEYS = {
  fileContents: KEYS.FILE_CONTENTS,
  pendingDiffs: KEYS.PENDING_DIFFS,
  previewHtml: KEYS.PREVIEW_HTML,
  agentSessions: KEYS.AGENT_SESSIONS,
  aiLogs: KEYS.AI_LOGS,
};

const largeCache = {
  fileContents: null,
  pendingDiffs: {},
  previewHtml: null,
  agentSessions: null,
  aiLogs: [],
};

let hydratePromise = null;
let isHydrated = false;

const parseJson = (val, fallback) => {
  if (val == null || val === '') return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const readLegacyLocal = (key, fallback, { raw = false } = {}) => {
  const storage = getStorage();
  if (!storage) return fallback;
  const val = storage.getItem(key);
  if (val == null) return fallback;
  if (raw) return val;
  return parseJson(val, fallback);
};

const clearLegacyLocal = (key) => {
  const storage = getStorage();
  if (storage) storage.removeItem(key);
};

const writeLocalFallback = (key, value) => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (value === null || value === undefined) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
    return true;
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage`, e);
    return false;
  }
};

const writeLarge = async (cacheKey, value) => {
  largeCache[cacheKey] = value;
  const idbKey = LARGE_IDB_KEYS[cacheKey];
  const durable = await idbSet(idbKey, value);
  if (durable) {
    clearLegacyLocal(idbKey);
    return true;
  }

  console.warn(`IndexedDB unavailable for ${cacheKey}; trying localStorage fallback`);
  const serialized =
    value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return writeLocalFallback(idbKey, serialized);
};

/**
 * Synchronous last-chance write for beforeunload. Updates the in-memory cache and
 * localStorage so the debounce window is not lost when the tab closes.
 */
const persistLargeSync = (cacheKey, value) => {
  largeCache[cacheKey] = value;
  const idbKey = LARGE_IDB_KEYS[cacheKey];
  const serialized =
    value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  const ok = writeLocalFallback(idbKey, serialized);
  // Fire-and-forget durable IDB write; unload may cancel it.
  void idbSet(idbKey, value);
  return ok;
};

const normalizePendingDiffs = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(([, diff]) => {
      if (!diff || typeof diff !== 'object' || typeof diff.originalContent !== 'string') {
        return false;
      }
      if (typeof diff.modifiedContent !== 'string' || !Array.isArray(diff.diffs)) return false;
      return diff.diffs.every(
        (range) =>
          range &&
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          Number.isFinite(range.origStart) &&
          Number.isFinite(range.origEnd),
      );
    }),
  );
};

const Settings = {
  get(key, defaultValue) {
    const storage = getStorage();
    if (storage) {
      return storage.getItem(key) || defaultValue;
    }
    return defaultValue;
  },

  set(key, value) {
    const storage = getStorage();
    if (!storage) return false;
    try {
      if (value === null || value === undefined) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, value);
      }
      return true;
    } catch (e) {
      console.warn(`Failed to save ${key} to localStorage`, e);
      return false;
    }
  },

  getProjectName(defaultValue = 'My App') {
    return this.get(KEYS.PROJECT_NAME, defaultValue);
  },

  setProjectName(name) {
    this.set(KEYS.PROJECT_NAME, name);
  },

  getTheme(defaultValue = 'dark') {
    return this.get(KEYS.THEME, defaultValue);
  },

  setTheme(theme) {
    this.set(KEYS.THEME, theme);
  },

  getOpenTabs() {
    const val = this.get(KEYS.OPEN_TABS);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse open tabs from localStorage', e);
      return null;
    }
  },

  setOpenTabs(tabs) {
    const tabsToSave = tabs.map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      ...(t.viewType ? { viewType: t.viewType } : {}),
      ...(t.file ? { file: { name: t.file.name, path: t.file.path } } : {}),
      ...(t.sourceFilePath ? { sourceFilePath: t.sourceFilePath } : {}),
    }));
    return this.set(KEYS.OPEN_TABS, JSON.stringify(tabsToSave));
  },

  getActiveTabId() {
    return this.get(KEYS.ACTIVE_TAB_ID);
  },

  setActiveTabId(id) {
    this.set(KEYS.ACTIVE_TAB_ID, id);
  },

  getLastCodeTabId() {
    return this.get(KEYS.LAST_CODE_TAB_ID);
  },

  setLastCodeTabId(id) {
    this.set(KEYS.LAST_CODE_TAB_ID, id);
  },

  getPromptHistory() {
    const val = this.get(KEYS.PROMPT_HISTORY);
    if (!val) return [];
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse prompt history from localStorage', e);
      return [];
    }
  },

  addPromptHistory(prompt) {
    if (!prompt || !prompt.trim()) return;
    const history = this.getPromptHistory();
    // Add to beginning, remove duplicates of the same prompt, limit to 50
    const newHistory = [prompt.trim(), ...history.filter((p) => p !== prompt.trim())].slice(0, 50);
    this.set(KEYS.PROMPT_HISTORY, JSON.stringify(newHistory));
  },

  setPromptHistory(history) {
    const next = Array.isArray(history)
      ? history
          .map((p) => (typeof p === 'string' ? p.trim() : ''))
          .filter(Boolean)
          .filter((p, index, arr) => arr.indexOf(p) === index)
          .slice(0, 50)
      : [];
    return this.set(KEYS.PROMPT_HISTORY, next.length ? JSON.stringify(next) : null);
  },

  getPromptDraft(defaultValue = '') {
    return this.get(KEYS.PROMPT_DRAFT, defaultValue);
  },

  setPromptDraft(prompt) {
    this.set(KEYS.PROMPT_DRAFT, prompt || null);
  },

  getAILogs() {
    return Array.isArray(largeCache.aiLogs) ? largeCache.aiLogs : [];
  },

  async setAILogs(logs) {
    const logsToSave = (logs || []).slice(-50);
    return writeLarge('aiLogs', logsToSave);
  },

  getFileContents() {
    return largeCache.fileContents;
  },

  async setFileContents(contents) {
    return writeLarge('fileContents', contents && typeof contents === 'object' ? contents : {});
  },

  getPendingDiffs() {
    return normalizePendingDiffs(largeCache.pendingDiffs);
  },

  async setPendingDiffs(diffs) {
    const next = normalizePendingDiffs(diffs);
    return writeLarge('pendingDiffs', next);
  },

  /**
   * Synchronous unload flush for editor buffers. Prefer this in beforeunload handlers.
   */
  flushEditorBuffersSync(fileContents, pendingDiffs) {
    const contentsOk = persistLargeSync(
      'fileContents',
      fileContents && typeof fileContents === 'object' ? fileContents : {},
    );
    const diffsOk = persistLargeSync('pendingDiffs', normalizePendingDiffs(pendingDiffs));
    return contentsOk && diffsOk;
  },

  getPreviewHtml() {
    return largeCache.previewHtml;
  },

  async setPreviewHtml(html) {
    return writeLarge('previewHtml', html || null);
  },

  getSidebarWidth(defaultValue = 280) {
    const val = this.get(KEYS.SIDEBAR_WIDTH);
    return val ? Number.parseInt(val, 10) : defaultValue;
  },

  setSidebarWidth(width) {
    this.set(KEYS.SIDEBAR_WIDTH, width.toString());
  },

  getPromptWidth(defaultValue = 360) {
    const val = this.get(KEYS.PROMPT_WIDTH);
    return val ? Number.parseInt(val, 10) : defaultValue;
  },

  setPromptWidth(width) {
    this.set(KEYS.PROMPT_WIDTH, width.toString());
  },

  getIsSidebarOpen(defaultValue = true) {
    const val = this.get(KEYS.IS_SIDEBAR_OPEN, defaultValue.toString());
    return val === 'true';
  },

  setIsSidebarOpen(isOpen) {
    this.set(KEYS.IS_SIDEBAR_OPEN, isOpen.toString());
  },

  getShowAIInput(defaultValue = true) {
    const val = this.get(KEYS.SHOW_AI_INPUT, defaultValue.toString());
    return val === 'true';
  },

  setShowAIInput(show) {
    this.set(KEYS.SHOW_AI_INPUT, show.toString());
  },

  getExpandedFolders() {
    const val = this.get(KEYS.EXPANDED_FOLDERS);
    if (!val) return {};
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse expanded folders from localStorage', e);
      return {};
    }
  },

  setExpandedFolders(expanded) {
    this.set(KEYS.EXPANDED_FOLDERS, JSON.stringify(expanded));
  },

  getAICompletionEnabled(defaultValue = true) {
    const val = this.get(KEYS.AI_COMPLETION_ENABLED, defaultValue.toString());
    return val === 'true';
  },

  setAICompletionEnabled(enabled) {
    this.set(KEYS.AI_COMPLETION_ENABLED, enabled.toString());
  },

  getAIPromptModel(defaultValue = '') {
    return this.get(KEYS.AI_PROMPT_MODEL, defaultValue);
  },

  setAIPromptModel(modelId) {
    this.set(KEYS.AI_PROMPT_MODEL, modelId);
  },

  getAIModelExpanded() {
    const val = this.get(KEYS.AI_MODEL_EXPANDED);
    if (!val) return {};
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse AI model expanded state from localStorage', e);
      return {};
    }
  },

  setAIModelExpanded(expanded) {
    this.set(KEYS.AI_MODEL_EXPANDED, JSON.stringify(expanded));
  },

  getTemplate(defaultValue = 'default') {
    return this.get(KEYS.TEMPLATE, defaultValue);
  },

  setTemplate(template) {
    this.set(KEYS.TEMPLATE, template);
  },

  getEditorReadOnly(defaultValue = false) {
    const val = this.get(KEYS.EDITOR_READ_ONLY, defaultValue.toString());
    return val === 'true';
  },

  setEditorReadOnly(isReadOnly) {
    this.set(KEYS.EDITOR_READ_ONLY, isReadOnly.toString());
  },

  getAgentSessions() {
    const parsed = largeCache.agentSessions;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  },

  async setAgentSessions(payload) {
    if (!payload || typeof payload !== 'object') {
      return writeLarge('agentSessions', null);
    }
    return writeLarge('agentSessions', payload);
  },

  getActiveAgentSessionId(defaultValue = null) {
    return this.get(KEYS.ACTIVE_AGENT_SESSION, defaultValue);
  },

  setActiveAgentSessionId(id) {
    this.set(KEYS.ACTIVE_AGENT_SESSION, id || null);
  },

  /**
   * Load large project blobs from IndexedDB (migrating legacy localStorage once).
   * Call before reading fileContents / pendingDiffs / previewHtml / sessions / logs.
   *
   * Prefer localStorage when present: durable IDB writes clear it, so a remaining
   * localStorage copy means either an unfinished migration or a fresher beforeunload flush.
   */
  async hydrate() {
    if (isHydrated) return true;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const loadOne = async (cacheKey, fallback, { raw = false } = {}) => {
        const idbKey = LARGE_IDB_KEYS[cacheKey];
        const legacy = readLegacyLocal(idbKey, fallback, { raw });
        const hasLegacy = legacy != null && legacy !== fallback;
        let value = hasLegacy ? legacy : await idbGet(idbKey);

        if (hasLegacy) {
          // Promote fresher/migrating localStorage into IDB, then free the legacy slot.
          const durable = await idbSet(idbKey, legacy);
          if (durable) clearLegacyLocal(idbKey);
        } else if (value == null) {
          value = fallback;
        }

        largeCache[cacheKey] = value == null ? fallback : value;
      };

      await Promise.all([
        loadOne('fileContents', null),
        loadOne('pendingDiffs', {}),
        loadOne('previewHtml', null, { raw: true }),
        loadOne('agentSessions', null),
        loadOne('aiLogs', []),
      ]);

      largeCache.pendingDiffs = normalizePendingDiffs(largeCache.pendingDiffs);
      if (!Array.isArray(largeCache.aiLogs)) largeCache.aiLogs = [];
      isHydrated = true;
      return true;
    })().catch((e) => {
      console.warn('Settings.hydrate failed; using empty large-store defaults', e);
      isHydrated = true;
      return false;
    });

    return hydratePromise;
  },

  isHydrated() {
    return isHydrated;
  },

  /** Test helper: reset in-memory hydration state. */
  _resetHydrationForTests() {
    hydratePromise = null;
    isHydrated = false;
    largeCache.fileContents = null;
    largeCache.pendingDiffs = {};
    largeCache.previewHtml = null;
    largeCache.agentSessions = null;
    largeCache.aiLogs = [];
  },

  async reset(template = 'default') {
    const storage = getStorage();
    if (storage) {
      for (const key of Object.values(KEYS)) {
        storage.removeItem(key);
      }
    }
    await idbClear();
    largeCache.fileContents = null;
    largeCache.pendingDiffs = {};
    largeCache.previewHtml = null;
    largeCache.agentSessions = null;
    largeCache.aiLogs = [];
    if (template) {
      this.setTemplate(template);
    }
  },
};

export default Settings;
