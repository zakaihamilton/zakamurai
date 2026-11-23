import { createSettingsEditorBuffers } from './SettingsEditorBuffers';
import { createSettingsHealthTracker } from './SettingsHealth';
import { readStorageItem, writeStorageItem } from './SettingsKeys';
import { createSettingsPreferences } from './SettingsPreferences';

const health = createSettingsHealthTracker();

const preferences = createSettingsPreferences({
  get: (key, defaultValue = null) => Settings.get(key, defaultValue),
  set: (key, value) => Settings.set(key, value),
});

const { resetBuffers, ...editorBufferApi } = createSettingsEditorBuffers({
  recordStorageSuccess: health.recordStorageSuccess,
  recordStorageFailure: health.recordStorageFailure,
  getFacade: () => Settings,
});

const Settings = {
  getStorageHealth: health.getStorageHealth,
  refreshStorageHealth: health.refreshStorageHealth,

  get(key: string, defaultValue: string | null = null) {
    return readStorageItem(key, defaultValue);
  },

  set(key: string, value: string | null) {
    return writeStorageItem(key, value);
  },

  ...preferences,
  ...editorBufferApi,

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
    await resetBuffers();
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
