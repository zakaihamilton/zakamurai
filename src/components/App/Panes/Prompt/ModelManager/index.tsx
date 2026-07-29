import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import Dialog from '@/components/ui/Dialog';
import React, { useMemo, useState } from 'react';
import styles from './ModelManager.module.css';
import ModelSearch from './ModelSearch';
import ModelTable from './ModelTable';
import RemoveCacheDialog from './RemoveCacheDialog';
import { modelValues } from './modelUtils';

export default function ModelManager({
  isOpen,
  selectedModelId,
  cachedModelIds = [],
  onCancel,
  onModelCacheAction,
  modelCacheWork,
  modelCacheProgress,
  modelCacheError,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState(null);
  const [modelPendingRemoval, setModelPendingRemoval] = useState(null);

  const visibleModels = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    const models = WEB_LLM_MODELS.filter((model) => {
      if (!query) return true;
      const values = modelValues(model, selectedModelId, cachedModelIds);
      return Object.values(values).some((value) =>
        String(value).toLocaleLowerCase().includes(query),
      );
    });

    if (!sort) return models;

    return models.toSorted((left, right) => {
      const leftValue = modelValues(left, selectedModelId, cachedModelIds)[sort.key];
      const rightValue = modelValues(right, selectedModelId, cachedModelIds)[sort.key];
      const comparison =
        typeof leftValue === 'number'
          ? leftValue - rightValue
          : leftValue.localeCompare(rightValue, undefined, {
              numeric: true,
              sensitivity: 'base',
            });
      return sort.direction === 'ascending' ? comparison : -comparison;
    });
  }, [cachedModelIds, searchTerm, selectedModelId, sort]);

  const toggleSort = (key) => {
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        title="AI Models"
        onCancel={onCancel}
        footer={null}
        className={styles.modelDialog}
      >
        <div className={styles.modelManager}>
          <div className={styles.modelManagerIntro}>
            <p>Choose the local browser model that matches this device and the kind of edit.</p>
          </div>
          <ModelSearch searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
          <ModelTable
            visibleModels={visibleModels}
            sort={sort}
            onToggleSort={toggleSort}
            selectedModelId={selectedModelId}
            cachedModelIds={cachedModelIds}
            modelCacheWork={modelCacheWork}
            onModelCacheAction={onModelCacheAction}
            onRequestUncache={setModelPendingRemoval}
          />
          {(modelCacheProgress || modelCacheError) && (
            <div
              className={`${styles.modelManagerStatus} ${
                modelCacheError ? styles.modelManagerError : ''
              }`}
            >
              {modelCacheError || modelCacheProgress}
            </div>
          )}
        </div>
      </Dialog>
      <RemoveCacheDialog
        model={modelPendingRemoval}
        onCancel={() => setModelPendingRemoval(null)}
        onConfirm={() => {
          if (modelPendingRemoval) {
            onModelCacheAction?.(modelPendingRemoval, 'uncache');
          }
          setModelPendingRemoval(null);
        }}
      />
    </>
  );
}
