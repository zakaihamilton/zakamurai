import type { PromptMode } from '@/components/state/domain-types';
import { Icons } from '@/components/ui/Icons';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import type { PromptComposerProps } from '../prompt-types';
import styles from './Composer.module.css';

export default function PromptComposer({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  onStop,
  isAIProcessing,
  isButtonActive,
  isOpen,
  selectedModelInfo = { id: '' },
  modelOptions = [],
  onChangeModel = () => {},
  onLoadCachedModelIds,
  onOpenModelManager,
  promptMode = 'ask',
  onChangePromptMode = () => {},
}: PromptComposerProps) {
  const modeOptions: Array<{ value: PromptMode; label: string }> = [
    { value: 'ask', label: 'Ask' },
    { value: 'plan', label: 'Plan' },
    { value: 'edit', label: 'Edit' },
    { value: 'fix', label: 'Fix' },
  ];
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <div className={styles.composer}>
        <textarea
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={isAIProcessing || !isOpen}
          placeholder={
            isAIProcessing
              ? 'AI Manager is working... Please wait.'
              : 'Tell the AI Manager what to do...'
          }
          className={styles.input}
          tabIndex={isOpen ? undefined : -1}
        />
        <div
          className={styles.toolbar}
          onFocusCapture={onLoadCachedModelIds}
          onPointerDown={onLoadCachedModelIds}
        >
          <div className={styles.modelControl}>
            <Select
              id="ai-prompt-mode"
              label="Mode"
              value={promptMode}
              options={modeOptions}
              onChange={(value) => onChangePromptMode(value as PromptMode)}
              disabled={isAIProcessing || !isOpen}
              tabIndex={isOpen ? undefined : -1}
              className={styles.modeSelect}
            />
            <Select
              id="ai-model-select"
              label="Model"
              value={selectedModelInfo.id}
              options={modelOptions}
              onChange={onChangeModel}
              disabled={isAIProcessing || !isOpen}
              tabIndex={isOpen ? undefined : -1}
              className={styles.modelSelect}
            />
            <Tooltip content="Manage AI models">
              <button
                type="button"
                className={styles.modelManagerButton}
                onClick={onOpenModelManager}
                disabled={!isOpen || isAIProcessing}
                aria-label="Manage AI models"
                tabIndex={isOpen ? undefined : -1}
              >
                <Icons.Info size={15} />
              </button>
            </Tooltip>
          </div>
          <div className={styles.actions}>
            {isAIProcessing && (
              <Tooltip content="Stop Agent" shortcut={formatShortcut('⌘.')}>
                <button
                  type="button"
                  aria-label="Stop agent"
                  onClick={onStop}
                  className={`${styles.button} ${styles.stopButton}`}
                  tabIndex={isOpen ? undefined : -1}
                >
                  <Icons.Close />
                </button>
              </Tooltip>
            )}
            <Tooltip content="Execute prompt" shortcut="↵">
              <button
                type="submit"
                aria-label="Execute prompt"
                disabled={!isButtonActive || !isOpen}
                className={`${styles.button} ${
                  isButtonActive ? styles.buttonActive : styles.buttonDisabled
                }`}
                tabIndex={isOpen ? undefined : -1}
              >
                <Icons.Send />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </form>
  );
}
