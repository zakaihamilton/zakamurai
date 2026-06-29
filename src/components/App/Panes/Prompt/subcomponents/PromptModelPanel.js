import { Icons } from '@/components/ui/Icons';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip/Tooltip';
import React from 'react';
import styles from './PromptModelPanel.module.css';

export default function PromptModelPanel({
  selectedModelInfo,
  modelOptions,
  onChangeModel,
  onLoadCachedModelIds,
  onOpenModelManager,
  isAIProcessing,
  isOpen,
}) {
  return (
    <div
      className={styles.modelPanel}
      onFocusCapture={onLoadCachedModelIds}
      onPointerDown={onLoadCachedModelIds}
    >
      <div className={styles.modelControlRow}>
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
            disabled={!isOpen}
            aria-label="Manage AI models"
            tabIndex={isOpen ? undefined : -1}
          >
            <Icons.Info size={16} />
          </button>
        </Tooltip>
      </div>
      <div className={styles.modelSummary}>
        <span>{selectedModelInfo.requirement}</span>
        <code>{selectedModelInfo.id}</code>
      </div>
    </div>
  );
}
