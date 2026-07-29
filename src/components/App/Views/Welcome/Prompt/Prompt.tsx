import { getCachedWebLLMModelIds } from '@/components/AI/WebLLMAPI';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { WebLLMState } from '@/components/AI/WebLLMState';
import { AppState } from '@/components/App/AppState';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { LogState } from '@/components/App/Views/LogArea';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Select from '@/components/ui/Select';
import React, { useCallback, useState } from 'react';
import styles from './Prompt.module.css';
import { requireStore } from '../../../types';

export default function WelcomePrompt() {
  const [value, setValue] = useState('');
  const [isDownloadConfirmationOpen, setDownloadConfirmationOpen] = useState(false);
  const { isMobile } = requireStore(AppState.useState(['isMobile']));
  const promptUiState = PromptUiState.usePassiveState();
  const sidebarState = SidebarState.usePassiveState();
  const { isAIProcessing } = requireStore(LogState.useState(['isAIProcessing']));
  const { cachedModelIds = [] } = requireStore(WebLLMState.useState(['cachedModelIds']));
  const selectedModel = promptUiState?.selectedModel || RECOMMENDED_WEB_LLM_MODEL.id;
  const selectedModelInfo =
    WEB_LLM_MODELS.find((model) => model.id === selectedModel) || RECOMMENDED_WEB_LLM_MODEL;
  const modelOptions = WEB_LLM_MODELS.map((model) => ({
    value: model.id,
    label: model.name,
    description: model.requirement,
    badges: [
      model.recommended ? 'Recommended' : '',
      cachedModelIds.includes(model.id) ? 'Cached' : '',
    ].filter(Boolean),
  }));

  const setSelectedModel = useCallback(
    (modelId: string) => {
      promptUiState?.((draft) => {
        draft.selectedModel = modelId;
      });
    },
    [promptUiState],
  );

  const startRequest = useCallback(() => {
    const request = value.trim();
    if (!request || isAIProcessing || !promptUiState || !sidebarState) return;

    promptUiState((draft) => {
      draft.welcomeRequest = { text: request, scope: 'project' };
    });
    sidebarState((draft) => {
      if (isMobile) draft.isAIInputPopupOpen = true;
      else draft.showAIInput = true;
    });
    setValue('');
  }, [isAIProcessing, isMobile, promptUiState, sidebarState, value]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!value.trim() || isAIProcessing) return;

      let availableModelIds = cachedModelIds;
      try {
        availableModelIds = await getCachedWebLLMModelIds();
      } catch (error) {
        console.warn('[Welcome] Unable to inspect the local model cache:', error);
      }
      if (availableModelIds.includes(selectedModel)) {
        startRequest();
      } else {
        setDownloadConfirmationOpen(true);
      }
    },
    [cachedModelIds, isAIProcessing, selectedModel, startRequest, value],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.composer}>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            aria-label="Describe what you want to build"
            disabled={isAIProcessing}
            className={styles.input}
            rows={2}
          />
          <div className={styles.composerFooter}>
            <Select
              id="welcome-model-select"
              ariaLabel="Choose local AI model"
              value={selectedModel}
              options={modelOptions}
              onChange={setSelectedModel}
              disabled={isAIProcessing}
              className={styles.modelSelect}
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!value.trim() || isAIProcessing}
              aria-label="Start building with AI"
            >
              <Icons.Send size={18} />
              <span>Build</span>
            </button>
          </div>
        </div>
        <p className={styles.privacy}>
          Runs locally in your browser. Your project stays on this device.
        </p>
      </form>
      <Dialog
        isOpen={isDownloadConfirmationOpen}
        title="Download local AI model?"
        message={`${selectedModelInfo.name} is about ${selectedModelInfo.storageMB.toLocaleString()} MB. It downloads to this browser and runs locally on this device.`}
        confirmText="Download and build"
        cancelText="Cancel"
        onCancel={() => setDownloadConfirmationOpen(false)}
        onConfirm={() => {
          setDownloadConfirmationOpen(false);
          startRequest();
        }}
      />
    </>
  );
}
