import { Icons } from '@/components/ui/Icons';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './PromptComposer.module.css';

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
}) {
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <div className={styles.composer}>
        <textarea
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={isAIProcessing || !isOpen}
          placeholder={
            isAIProcessing ? 'Agent is working... Please wait.' : 'Tell the Agent what to do...'
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
