const KEYS = {
  PROJECT_NAME: 'zakamurai_project_name',
  THEME: 'zakamurai-theme',
  OPEN_TABS: 'zakamurai_open_tabs',
  ACTIVE_TAB_ID: 'zakamurai_active_tab_id',
  PROMPT_HISTORY: 'zakamurai_prompt_history',
};

const Settings = {
  get(key, defaultValue) {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || defaultValue;
    }
    return defaultValue;
  },

  set(key, value) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },

  getProjectName(defaultValue = 'My NextJS App') {
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
      ...(t.file ? { file: { name: t.file.name, path: t.file.path } } : {}),
    }));
    this.set(KEYS.OPEN_TABS, JSON.stringify(tabsToSave));
  },

  getActiveTabId() {
    return this.get(KEYS.ACTIVE_TAB_ID);
  },

  setActiveTabId(id) {
    this.set(KEYS.ACTIVE_TAB_ID, id);
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

  getAILogs() {
    const val = this.get(KEYS.AI_LOGS);
    if (!val) return [];
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse AI logs from localStorage', e);
      return [];
    }
  },

  setAILogs(logs) {
    // Keep only the last 50 logs
    const logsToSave = logs.slice(-50);
    this.set(KEYS.AI_LOGS, JSON.stringify(logsToSave));
  },
};

export default Settings;
