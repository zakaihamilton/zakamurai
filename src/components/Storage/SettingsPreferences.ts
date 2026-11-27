import type { Tab } from '@/types/domain-types';
import { readLegacyLocal, SETTINGS_KEYS } from './SettingsKeys';
import { normalizePromptHistory, serializeOpenTabs } from './SettingsSerialization';

type StorageAccessor = {
  get: (key: string, defaultValue?: string | null) => string | null;
  set: (key: string, value: string | null) => boolean;
};

export function createSettingsPreferences(storage: StorageAccessor) {
  function readJson<T>(key: string, fallback: T, errorMessage: string): T {
    const val = storage.get(key);
    if (!val) return fallback;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error(errorMessage, e);
      return fallback;
    }
  }

  const readBool = (key: string, defaultValue: boolean): boolean =>
    storage.get(key, defaultValue.toString()) === 'true';

  const readInt = (key: string, defaultValue: number): number => {
    const val = storage.get(key);
    return val ? Number.parseInt(val, 10) : defaultValue;
  };

  return {
    getProjectName(defaultValue = 'My App') {
      return storage.get(SETTINGS_KEYS.PROJECT_NAME, defaultValue);
    },

    setProjectName(name: string) {
      storage.set(SETTINGS_KEYS.PROJECT_NAME, name);
    },

    getTheme(defaultValue = 'dark') {
      return storage.get(SETTINGS_KEYS.THEME, defaultValue);
    },

    setTheme(theme: string) {
      storage.set(SETTINGS_KEYS.THEME, theme);
    },

    getOpenTabs(): Tab[] | null {
      return readJson<Tab[] | null>(
        SETTINGS_KEYS.OPEN_TABS,
        null,
        'Failed to parse open tabs from localStorage',
      );
    },

    setOpenTabs(tabs: Tab[]) {
      const tabsToSave = serializeOpenTabs(tabs);
      return storage.set(SETTINGS_KEYS.OPEN_TABS, JSON.stringify(tabsToSave));
    },

    getActiveTabId() {
      return storage.get(SETTINGS_KEYS.ACTIVE_TAB_ID);
    },

    setActiveTabId(id: string | null) {
      storage.set(SETTINGS_KEYS.ACTIVE_TAB_ID, id);
    },

    getLastCodeTabId() {
      return storage.get(SETTINGS_KEYS.LAST_CODE_TAB_ID);
    },

    setLastCodeTabId(id: string | null) {
      storage.set(SETTINGS_KEYS.LAST_CODE_TAB_ID, id);
    },

    getPromptHistory() {
      return readJson<string[]>(
        SETTINGS_KEYS.PROMPT_HISTORY,
        [],
        'Failed to parse prompt history from localStorage',
      );
    },

    addPromptHistory(prompt: string) {
      if (!prompt || !prompt.trim()) return;
      const history = this.getPromptHistory();
      // Add to beginning, remove duplicates of the same prompt, limit to 50
      const newHistory = [
        prompt.trim(),
        ...history.filter((p: string) => p !== prompt.trim()),
      ].slice(0, 50);
      storage.set(SETTINGS_KEYS.PROMPT_HISTORY, JSON.stringify(newHistory));
    },

    setPromptHistory(history: string[]) {
      const next = normalizePromptHistory(history);
      return storage.set(SETTINGS_KEYS.PROMPT_HISTORY, next.length ? JSON.stringify(next) : null);
    },

    getPromptDraft(defaultValue = '') {
      return storage.get(SETTINGS_KEYS.PROMPT_DRAFT, defaultValue);
    },

    setPromptDraft(prompt: string) {
      storage.set(SETTINGS_KEYS.PROMPT_DRAFT, prompt || null);
    },

    getWelcomePromptDraft(defaultValue = '') {
      return storage.get(SETTINGS_KEYS.WELCOME_PROMPT_DRAFT, defaultValue);
    },

    setWelcomePromptDraft(prompt: string) {
      storage.set(SETTINGS_KEYS.WELCOME_PROMPT_DRAFT, prompt || null);
    },

    getSidebarWidth(defaultValue = 280) {
      return readInt(SETTINGS_KEYS.SIDEBAR_WIDTH, defaultValue);
    },

    setSidebarWidth(width: number) {
      storage.set(SETTINGS_KEYS.SIDEBAR_WIDTH, width.toString());
    },

    getPromptWidth(defaultValue = 360) {
      return readInt(SETTINGS_KEYS.PROMPT_WIDTH, defaultValue);
    },

    setPromptWidth(width: number) {
      storage.set(SETTINGS_KEYS.PROMPT_WIDTH, width.toString());
    },

    getIsSidebarOpen(defaultValue = false) {
      return readBool(SETTINGS_KEYS.IS_SIDEBAR_OPEN, defaultValue);
    },

    setIsSidebarOpen(isOpen: boolean) {
      storage.set(SETTINGS_KEYS.IS_SIDEBAR_OPEN, isOpen.toString());
    },

    getShowAIInput(defaultValue = false) {
      return readBool(SETTINGS_KEYS.SHOW_AI_INPUT, defaultValue);
    },

    setShowAIInput(show: boolean) {
      storage.set(SETTINGS_KEYS.SHOW_AI_INPUT, show.toString());
    },

    getExpandedFolders() {
      return readJson<Record<string, boolean>>(
        SETTINGS_KEYS.EXPANDED_FOLDERS,
        {},
        'Failed to parse expanded folders from localStorage',
      );
    },

    setExpandedFolders(expanded: Record<string, boolean>) {
      storage.set(SETTINGS_KEYS.EXPANDED_FOLDERS, JSON.stringify(expanded));
    },

    getAICompletionEnabled(defaultValue = true) {
      return readBool(SETTINGS_KEYS.AI_COMPLETION_ENABLED, defaultValue);
    },

    setAICompletionEnabled(enabled: boolean) {
      storage.set(SETTINGS_KEYS.AI_COMPLETION_ENABLED, enabled.toString());
    },

    getAIPromptModel(defaultValue = '') {
      return storage.get(SETTINGS_KEYS.AI_PROMPT_MODEL, defaultValue);
    },

    setAIPromptModel(modelId: string) {
      storage.set(SETTINGS_KEYS.AI_PROMPT_MODEL, modelId);
    },

    getAIModelExpanded() {
      return readJson<Record<string, boolean>>(
        SETTINGS_KEYS.AI_MODEL_EXPANDED,
        {},
        'Failed to parse AI model expanded state from localStorage',
      );
    },

    setAIModelExpanded(expanded: Record<string, boolean>) {
      storage.set(SETTINGS_KEYS.AI_MODEL_EXPANDED, JSON.stringify(expanded));
    },

    getTemplate(defaultValue = 'default') {
      return storage.get(SETTINGS_KEYS.TEMPLATE, defaultValue);
    },

    setTemplate(template: string) {
      storage.set(SETTINGS_KEYS.TEMPLATE, template);
    },

    getActiveLibraryProjectId() {
      return storage.get(SETTINGS_KEYS.ACTIVE_LIBRARY_PROJECT_ID);
    },

    setActiveLibraryProjectId(id: string | null) {
      storage.set(SETTINGS_KEYS.ACTIVE_LIBRARY_PROJECT_ID, id);
    },

    getEditorReadOnly(defaultValue = false) {
      return readBool(SETTINGS_KEYS.EDITOR_READ_ONLY, defaultValue);
    },

    setEditorReadOnly(isReadOnly: boolean) {
      storage.set(SETTINGS_KEYS.EDITOR_READ_ONLY, isReadOnly.toString());
    },

    getActiveAgentSessionId(defaultValue: string | null = null) {
      return storage.get(SETTINGS_KEYS.ACTIVE_AGENT_SESSION, defaultValue);
    },

    setActiveAgentSessionId(id: string | null) {
      storage.set(SETTINGS_KEYS.ACTIVE_AGENT_SESSION, id || null);
    },

    getWorkspaceProfile() {
      const value = readLegacyLocal(SETTINGS_KEYS.WORKSPACE_PROFILE, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    },

    setWorkspaceProfile(profile: Record<string, unknown>) {
      return storage.set(SETTINGS_KEYS.WORKSPACE_PROFILE, JSON.stringify(profile || {}));
    },
  };
}
