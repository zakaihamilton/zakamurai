import { reportDiagnostic } from '@/components/Diagnostics';
import type { ChangeSet, LogEntry, PendingDiff, Tab } from '@/components/state/domain-types';
import { isStringRecord, normalizeRecoveryCheckpoint } from '@/contracts/runtime';
import {
  normalizePendingDiffs,
  normalizePromptHistory,
  parseStoredJson,
  serializeOpenTabs,
} from './SettingsSerialization';
import { idbClear, idbGet, idbSet } from './idbStore';
import type {
  LargeCache,
  LargeCacheKey,
  RecoveryCheckpoint,
  SettingsStorageHealth,
  StorageLayer,
} from './storage-types';

const KEYS = {
  PROJECT_NAME: 'zakamurai_project_name',
  THEME: 'zakamurai-theme',
  OPEN_TABS: 'zakamurai_open_tabs',
  ACTIVE_TAB_ID: 'zakamurai_active_tab_id',
  LAST_CODE_TAB_ID: 'zakamurai_last_code_tab_id',
  PROMPT_HISTORY: 'zakamurai_prompt_history',
  PROMPT_DRAFT: 'zakamurai_prompt_draft',
  WELCOME_PROMPT_DRAFT: 'zakamurai_welcome_prompt_draft',
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
  WORKSPACE_PROFILE: 'zakamurai_workspace_profile',
  CHANGE_SETS: 'zakamurai_change_sets',
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
  changeSets: KEYS.CHANGE_SETS,
};
const RECOVERY_CHECKPOINT_KEY = 'zakamurai_recovery_checkpoint_v1';
const MAX_PERSISTED_AI_LOGS = 1000;

const largeCache: LargeCache = {
  fileContents: null,
  pendingDiffs: {},
  previewHtml: null,
  agentSessions: null,
  aiLogs: [],
  changeSets: { activeId: null, items: [] },
};

let hydratePromise: Promise<boolean> | null = null;
let isHydrated = false;
let lastStorageHealth: SettingsStorageHealth = {
  status: 'healthy',
  layer: null,
  message: null,
  usage: null,
  quota: null,
  quotaWarning: false,
  lastSuccessfulPersistAt: null,
};
let recoveryCheckpoint: RecoveryCheckpoint | null = null;

const refreshStorageEstimate = async () => {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return lastStorageHealth;
  }
  try {
    const { usage = null, quota = null } = await navigator.storage.estimate();
    const quotaWarning =
      usage != null &&
      quota != null &&
      Number.isFinite(usage) &&
      Number.isFinite(quota) &&
      quota > 0 &&
      usage / quota >= 0.8;
    lastStorageHealth = { ...lastStorageHealth, usage, quota, quotaWarning };
    if (quotaWarning) {
      reportDiagnostic({
        source: 'storage',
        severity: 'warning',
        message: 'Browser storage is at least 80% full.',
      });
    }
  } catch {
    // Storage estimates are advisory and unsupported in some privacy modes.
  }
  return lastStorageHealth;
};

const recordStorageSuccess = async (layer: StorageLayer) => {
  lastStorageHealth = {
    ...lastStorageHealth,
    status: layer === 'localStorage' ? 'fallback' : 'healthy',
    layer,
    lastSuccessfulPersistAt: Date.now(),
  };
  await refreshStorageEstimate();
};

const recordStorageFailure = (message: string) => {
  lastStorageHealth = { ...lastStorageHealth, status: 'write-failed', layer: 'localStorage' };
  reportDiagnostic({ source: 'storage', severity: 'error', message });
};

/** Per-key write generation — bumped on every writeLarge / unload flush to fence clears. */
const largeWriteGen = {
  fileContents: 0,
  pendingDiffs: 0,
  previewHtml: 0,
  agentSessions: 0,
  aiLogs: 0,
  changeSets: 0,
};

function readLegacyLocal<T>(key: string, fallback: T, { raw = false } = {}): T {
  const storage = getStorage();
  if (!storage) return fallback;
  const val = storage.getItem(key);
  if (val == null) return fallback;
  if (raw) return val as T;
  return parseStoredJson(val, fallback);
}

const clearLegacyLocal = (key: string) => {
  const storage = getStorage();
  if (storage) storage.removeItem(key);
};

const writeLocalFallback = (key: string, value: string | null) => {
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

function setLargeCacheValue<K extends LargeCacheKey>(key: K, value: LargeCache[K]): void {
  largeCache[key] = value;
}

async function writeLarge<K extends LargeCacheKey>(
  cacheKey: K,
  value: LargeCache[K],
): Promise<boolean> {
  setLargeCacheValue(cacheKey, value);
  const idbKey = LARGE_IDB_KEYS[cacheKey];
  const myGen = ++largeWriteGen[cacheKey];
  const durable = await idbSet(idbKey, value);

  // A newer writeLarge or unload flush happened — do not clear a fresher localStorage snapshot.
  if (myGen !== largeWriteGen[cacheKey]) {
    return durable;
  }

  if (durable) {
    await recordStorageSuccess('indexeddb');
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
  const fallbackSaved = writeLocalFallback(idbKey, serialized);
  if (fallbackSaved) await recordStorageSuccess('localStorage');
  else recordStorageFailure(`Could not persist ${cacheKey} in IndexedDB or localStorage.`);
  return fallbackSaved;
}

/**
 * Synchronous last-chance write for beforeunload. Updates the in-memory cache and
 * localStorage so the debounce window is not lost when the tab closes.
 */
function persistLargeSync<K extends LargeCacheKey>(cacheKey: K, value: LargeCache[K]): boolean {
  setLargeCacheValue(cacheKey, value);
  // Invalidate in-flight writeLarge so it cannot clear this fresher unload snapshot.
  largeWriteGen[cacheKey] += 1;
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
}

const Settings = {
  getStorageHealth() {
    return { ...lastStorageHealth };
  },
  async refreshStorageHealth() {
    return refreshStorageEstimate();
  },
  get(key: string, defaultValue: string | null = null) {
    const storage = getStorage();
    if (storage) {
      return storage.getItem(key) || defaultValue;
    }
    return defaultValue;
  },

  set(key: string, value: string | null) {
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

  setProjectName(name: string) {
    this.set(KEYS.PROJECT_NAME, name);
  },

  getTheme(defaultValue = 'dark') {
    return this.get(KEYS.THEME, defaultValue);
  },

  setTheme(theme: string) {
    this.set(KEYS.THEME, theme);
  },

  getOpenTabs(): Tab[] | null {
    const val = this.get(KEYS.OPEN_TABS);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse open tabs from localStorage', e);
      return null;
    }
  },

  setOpenTabs(tabs: Tab[]) {
    const tabsToSave = serializeOpenTabs(tabs);
    return this.set(KEYS.OPEN_TABS, JSON.stringify(tabsToSave));
  },

  getActiveTabId() {
    return this.get(KEYS.ACTIVE_TAB_ID);
  },

  setActiveTabId(id: string | null) {
    this.set(KEYS.ACTIVE_TAB_ID, id);
  },

  getLastCodeTabId() {
    return this.get(KEYS.LAST_CODE_TAB_ID);
  },

  setLastCodeTabId(id: string | null) {
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

  addPromptHistory(prompt: string) {
    if (!prompt || !prompt.trim()) return;
    const history = this.getPromptHistory();
    // Add to beginning, remove duplicates of the same prompt, limit to 50
    const newHistory = [prompt.trim(), ...history.filter((p: string) => p !== prompt.trim())].slice(
      0,
      50,
    );
    this.set(KEYS.PROMPT_HISTORY, JSON.stringify(newHistory));
  },

  setPromptHistory(history: string[]) {
    const next = normalizePromptHistory(history);
    return this.set(KEYS.PROMPT_HISTORY, next.length ? JSON.stringify(next) : null);
  },

  getPromptDraft(defaultValue = '') {
    return this.get(KEYS.PROMPT_DRAFT, defaultValue);
  },

  setPromptDraft(prompt: string) {
    this.set(KEYS.PROMPT_DRAFT, prompt || null);
  },

  getWelcomePromptDraft(defaultValue = '') {
    return this.get(KEYS.WELCOME_PROMPT_DRAFT, defaultValue);
  },

  setWelcomePromptDraft(prompt: string) {
    this.set(KEYS.WELCOME_PROMPT_DRAFT, prompt || null);
  },

  getAILogs() {
    return Array.isArray(largeCache.aiLogs) ? largeCache.aiLogs : [];
  },

  async setAILogs(logs: LogEntry[]) {
    const logsToSave = (logs || []).slice(-MAX_PERSISTED_AI_LOGS);
    return writeLarge('aiLogs', logsToSave);
  },

  getFileContents() {
    return largeCache.fileContents;
  },

  async setFileContents(contents: Record<string, string> | null) {
    return writeLarge('fileContents', contents && typeof contents === 'object' ? contents : {});
  },

  getPendingDiffs() {
    return normalizePendingDiffs(largeCache.pendingDiffs);
  },

  async setPendingDiffs(diffs: Record<string, PendingDiff> | null) {
    const next = normalizePendingDiffs(diffs);
    return writeLarge('pendingDiffs', next);
  },

  /**
   * Synchronous unload flush for editor buffers. Prefer this in beforeunload handlers.
   */
  flushEditorBuffersSync(
    fileContents: Record<string, string> | null,
    pendingDiffs: Record<string, PendingDiff> | null,
  ) {
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

  async setPreviewHtml(html: string | null) {
    return writeLarge('previewHtml', html || null);
  },

  getSidebarWidth(defaultValue = 280) {
    const val = this.get(KEYS.SIDEBAR_WIDTH);
    return val ? Number.parseInt(val, 10) : defaultValue;
  },

  setSidebarWidth(width: number) {
    this.set(KEYS.SIDEBAR_WIDTH, width.toString());
  },

  getPromptWidth(defaultValue = 360) {
    const val = this.get(KEYS.PROMPT_WIDTH);
    return val ? Number.parseInt(val, 10) : defaultValue;
  },

  setPromptWidth(width: number) {
    this.set(KEYS.PROMPT_WIDTH, width.toString());
  },

  getIsSidebarOpen(defaultValue = false) {
    const val = this.get(KEYS.IS_SIDEBAR_OPEN, defaultValue.toString());
    return val === 'true';
  },

  setIsSidebarOpen(isOpen: boolean) {
    this.set(KEYS.IS_SIDEBAR_OPEN, isOpen.toString());
  },

  getShowAIInput(defaultValue = false) {
    const val = this.get(KEYS.SHOW_AI_INPUT, defaultValue.toString());
    return val === 'true';
  },

  setShowAIInput(show: boolean) {
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

  setExpandedFolders(expanded: Record<string, boolean>) {
    this.set(KEYS.EXPANDED_FOLDERS, JSON.stringify(expanded));
  },

  getAICompletionEnabled(defaultValue = true) {
    const val = this.get(KEYS.AI_COMPLETION_ENABLED, defaultValue.toString());
    return val === 'true';
  },

  setAICompletionEnabled(enabled: boolean) {
    this.set(KEYS.AI_COMPLETION_ENABLED, enabled.toString());
  },

  getAIPromptModel(defaultValue = '') {
    return this.get(KEYS.AI_PROMPT_MODEL, defaultValue);
  },

  setAIPromptModel(modelId: string) {
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

  setAIModelExpanded(expanded: Record<string, boolean>) {
    this.set(KEYS.AI_MODEL_EXPANDED, JSON.stringify(expanded));
  },

  getTemplate(defaultValue = 'default') {
    return this.get(KEYS.TEMPLATE, defaultValue);
  },

  setTemplate(template: string) {
    this.set(KEYS.TEMPLATE, template);
  },

  getEditorReadOnly(defaultValue = false) {
    const val = this.get(KEYS.EDITOR_READ_ONLY, defaultValue.toString());
    return val === 'true';
  },

  setEditorReadOnly(isReadOnly: boolean) {
    this.set(KEYS.EDITOR_READ_ONLY, isReadOnly.toString());
  },

  getAgentSessions() {
    const parsed = largeCache.agentSessions;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  },

  async setAgentSessions(payload: Record<string, unknown> | null) {
    if (!payload || typeof payload !== 'object') {
      return writeLarge('agentSessions', null);
    }
    return writeLarge('agentSessions', payload);
  },

  getActiveAgentSessionId(defaultValue = null) {
    return this.get(KEYS.ACTIVE_AGENT_SESSION, defaultValue);
  },

  setActiveAgentSessionId(id: string | null) {
    this.set(KEYS.ACTIVE_AGENT_SESSION, id || null);
  },

  getWorkspaceProfile() {
    const value = readLegacyLocal(KEYS.WORKSPACE_PROFILE, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  },

  setWorkspaceProfile(profile: Record<string, unknown>) {
    return this.set(KEYS.WORKSPACE_PROFILE, JSON.stringify(profile || {}));
  },

  getChangeSets() {
    const value = largeCache.changeSets;
    return value && typeof value === 'object' ? value : { activeId: null, items: [] };
  },

  async setChangeSets(changeSets: { activeId?: string | null; items?: ChangeSet[] } | null) {
    const items = Array.isArray(changeSets?.items) ? changeSets.items.slice(-20) : [];
    return writeLarge('changeSets', { activeId: changeSets?.activeId || null, items });
  },

  getRecoveryCheckpoint() {
    return recoveryCheckpoint ? { ...recoveryCheckpoint } : null;
  },

  async saveRecoveryCheckpoint(snapshot: Partial<RecoveryCheckpoint>) {
    const checkpoint = normalizeRecoveryCheckpoint({
      version: 1,
      savedAt: Date.now(),
      ...snapshot,
    });
    if (!checkpoint) return false;
    const saved = await idbSet(RECOVERY_CHECKPOINT_KEY, checkpoint);
    if (saved) recoveryCheckpoint = checkpoint;
    else {
      reportDiagnostic({
        source: 'storage',
        severity: 'warning',
        message: 'Recovery checkpoint could not be written to IndexedDB.',
      });
    }
    return saved;
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
      recoveryCheckpoint = normalizeRecoveryCheckpoint(await idbGet(RECOVERY_CHECKPOINT_KEY));
      async function loadOne<T>(
        cacheKey: LargeCacheKey,
        fallback: T,
        { raw = false }: { raw?: boolean } = {},
      ) {
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

        setLargeCacheValue(
          cacheKey,
          (value == null ? fallback : value) as LargeCache[typeof cacheKey],
        );
      }

      await Promise.all([
        loadOne('fileContents', null),
        loadOne('pendingDiffs', {}),
        loadOne('previewHtml', null, { raw: true }),
        loadOne('agentSessions', null),
        loadOne('aiLogs', []),
        loadOne('changeSets', { activeId: null, items: [] }),
      ]);

      largeCache.pendingDiffs = normalizePendingDiffs(largeCache.pendingDiffs);
      if (!isStringRecord(largeCache.fileContents) && recoveryCheckpoint) {
        largeCache.fileContents = recoveryCheckpoint.fileContents;
        largeCache.pendingDiffs = normalizePendingDiffs(recoveryCheckpoint.pendingDiffs);
        reportDiagnostic({
          source: 'storage',
          severity: 'warning',
          message: 'Recovered workspace buffers from the last valid recovery checkpoint.',
        });
      }
      if (!Array.isArray(largeCache.aiLogs)) largeCache.aiLogs = [];
      if (!largeCache.changeSets || typeof largeCache.changeSets !== 'object')
        largeCache.changeSets = { activeId: null, items: [] };
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
    largeCache.changeSets = { activeId: null, items: [] };
    recoveryCheckpoint = null;
    largeWriteGen.fileContents = 0;
    largeWriteGen.pendingDiffs = 0;
    largeWriteGen.previewHtml = 0;
    largeWriteGen.agentSessions = 0;
    largeWriteGen.aiLogs = 0;
    largeWriteGen.changeSets = 0;
  },

  async reset(
    template = 'default',
    {
      preserveTheme,
      preserveAIPromptModel,
      preserveWelcomePrompt,
    }: {
      preserveTheme?: string;
      preserveAIPromptModel?: string;
      preserveWelcomePrompt?: string;
    } = {},
  ) {
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
    largeCache.changeSets = { activeId: null, items: [] };
    recoveryCheckpoint = null;
    if (template) {
      this.setTemplate(template);
    }
    if (preserveTheme) {
      this.setTheme(preserveTheme);
    }
    if (preserveAIPromptModel) {
      this.setAIPromptModel(preserveAIPromptModel);
    }
    if (preserveWelcomePrompt) {
      this.setWelcomePromptDraft(preserveWelcomePrompt);
    }
  },
};

export default Settings;
