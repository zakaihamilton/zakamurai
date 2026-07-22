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
    if (storage) {
      if (value === null || value === undefined) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, value);
      }
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
    this.set(KEYS.OPEN_TABS, JSON.stringify(tabsToSave));
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

  getPromptDraft(defaultValue = '') {
    return this.get(KEYS.PROMPT_DRAFT, defaultValue);
  },

  setPromptDraft(prompt) {
    this.set(KEYS.PROMPT_DRAFT, prompt || null);
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

  getFileContents() {
    const val = this.get(KEYS.FILE_CONTENTS);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Failed to parse file contents from localStorage', e);
      return null;
    }
  },

  setFileContents(contents) {
    // We only save contents that are not too large to avoid localStorage limits
    // For a real app, we'd use IndexedDB or OPFS
    try {
      this.set(KEYS.FILE_CONTENTS, JSON.stringify(contents));
    } catch (e) {
      console.warn('Failed to save file contents to localStorage (likely size limit)', e);
    }
  },

  getPendingDiffs() {
    const val = this.get(KEYS.PENDING_DIFFS);
    if (!val) return {};
    try {
      const parsed = JSON.parse(val);
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
    } catch (e) {
      console.error('Failed to parse pending diffs from localStorage', e);
      return {};
    }
  },

  setPendingDiffs(diffs) {
    try {
      this.set(KEYS.PENDING_DIFFS, Object.keys(diffs || {}).length ? JSON.stringify(diffs) : null);
    } catch (e) {
      console.warn('Failed to save pending diffs to localStorage (likely size limit)', e);
    }
  },

  getPreviewHtml() {
    return this.get(KEYS.PREVIEW_HTML);
  },

  setPreviewHtml(html) {
    try {
      this.set(KEYS.PREVIEW_HTML, html);
    } catch (e) {
      console.warn('Failed to save preview HTML to localStorage (likely size limit)', e);
    }
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
    const val = this.get(KEYS.AGENT_SESSIONS);
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch (e) {
      console.error('Failed to parse agent sessions from localStorage', e);
      return null;
    }
  },

  setAgentSessions(payload) {
    try {
      if (!payload || typeof payload !== 'object') {
        this.set(KEYS.AGENT_SESSIONS, null);
        return;
      }
      this.set(KEYS.AGENT_SESSIONS, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save agent sessions to localStorage (likely size limit)', e);
    }
  },

  getActiveAgentSessionId(defaultValue = null) {
    return this.get(KEYS.ACTIVE_AGENT_SESSION, defaultValue);
  },

  setActiveAgentSessionId(id) {
    this.set(KEYS.ACTIVE_AGENT_SESSION, id || null);
  },

  reset(template = 'default') {
    const storage = getStorage();
    if (storage) {
      for (const key of Object.values(KEYS)) {
        storage.removeItem(key);
      }
      if (template) {
        this.setTemplate(template);
      }
    }
  },
};

export default Settings;
