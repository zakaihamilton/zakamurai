import { parseStoredJson } from './SettingsSerialization';
import type { LargeCache, LargeCacheKey } from './storage-types';

export const SETTINGS_KEYS = {
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
  PENDING_DELETIONS: 'zakamurai_pending_deletions',
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
  ACTIVE_LIBRARY_PROJECT_ID: 'zakamurai_active_library_project_id',
} as const;

/** Keys stored primarily in IndexedDB (too large for reliable localStorage). */
export const LARGE_IDB_KEYS: Record<LargeCacheKey, string> = {
  fileContents: SETTINGS_KEYS.FILE_CONTENTS,
  pendingDiffs: SETTINGS_KEYS.PENDING_DIFFS,
  pendingDeletions: SETTINGS_KEYS.PENDING_DELETIONS,
  previewHtml: SETTINGS_KEYS.PREVIEW_HTML,
  agentSessions: SETTINGS_KEYS.AGENT_SESSIONS,
  aiLogs: SETTINGS_KEYS.AI_LOGS,
  changeSets: SETTINGS_KEYS.CHANGE_SETS,
};

export const MAX_PERSISTED_AI_LOGS = 1000;

export function createEmptyLargeCache(): LargeCache {
  return {
    fileContents: null,
    pendingDiffs: {},
    pendingDeletions: null,
    previewHtml: null,
    agentSessions: null,
    aiLogs: [],
    changeSets: { activeId: null, items: [] },
  };
}

export function createLargeWriteGenerations(): { [K in LargeCacheKey]: number } {
  return {
    fileContents: 0,
    pendingDiffs: 0,
    pendingDeletions: 0,
    previewHtml: 0,
    agentSessions: 0,
    aiLogs: 0,
    changeSets: 0,
  };
}

export function getStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    if (
      typeof storage?.getItem !== 'function' ||
      typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function'
    ) {
      return null;
    }
    return storage;
  } catch {
    // Privacy modes can expose localStorage while throwing on property access.
    return null;
  }
}

export function readStorageItem(key: string, defaultValue: string | null = null): string | null {
  const storage = getStorage();
  try {
    if (storage) return storage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
  return defaultValue;
}

export function writeStorageItem(key: string, value: string | null): boolean {
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
}

export function readLegacyLocal<T>(key: string, fallback: T, { raw = false } = {}): T {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const val = storage.getItem(key);
    if (val == null) return fallback;
    if (raw) return val as T;
    return parseStoredJson(val, fallback);
  } catch {
    return fallback;
  }
}

export function clearLegacyLocal(key: string): void {
  const storage = getStorage();
  try {
    storage?.removeItem(key);
  } catch {
    // Fallback cleanup is best effort when browser storage is unavailable.
  }
}
