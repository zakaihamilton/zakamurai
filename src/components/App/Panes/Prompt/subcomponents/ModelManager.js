import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import React, { useMemo, useState } from 'react';

const detailValue = (model, label) => model.details?.find(([key]) => key === label)?.[1] || '';

const formatSize = (megabytes) => {
  if (megabytes < 1000) return `${Math.round(megabytes).toLocaleString()} MB`;
  return `${(megabytes / 1000).toFixed(2).replace(/0$/, '')} GB`;
};

const COLUMNS = [
  { key: 'model', label: 'Model' },
  { key: 'bestFor', label: 'Best for' },
  { key: 'ram', label: 'RAM' },
  { key: 'storage', label: 'Storage' },
  { key: 'speed', label: 'Speed' },
];

const modelValues = (model, selectedModelId, cachedModelIds) => {
  const statuses = [
    model.id === selectedModelId ? 'Selected' : '',
    model.recommended ? 'Recommended' : '',
    cachedModelIds.includes(model.id) ? 'Cached' : '',
  ].filter(Boolean);

  return {
    model: `${model.name} ${model.id}`,
    bestFor: detailValue(model, 'Best for'),
    ram: model.ramMB,
    storage: model.storageMB,
    speed: detailValue(model, 'Speed'),
    status: statuses.join(' '),
    searchText: `${model.requirement} ${model.details?.flat().join(' ') || ''}`,
  };
};

export default function ModelManager({
  isOpen,
  selectedModelId,
  cachedModelIds = [],
  onCancel,
  onModelCacheAction,
  modelCacheWork,
  modelCacheProgress,
  modelCacheError,
  styles = {},
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
          <div className={styles.modelSearch}>
            <Icons.Search size={14} />
            <input
              type="search"
              aria-label="Search AI models"
              placeholder="Search models, capabilities, or status..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear model search"
              >
                <Icons.Close size={14} />
              </button>
            )}
          </div>
          <div className={styles.modelTableWrap}>
            <table className={styles.modelTable}>
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      aria-sort={sort?.key === column.key ? sort.direction : 'none'}
                    >
                      <button type="button" onClick={() => toggleSort(column.key)}>
                        {column.label}
                        <span aria-hidden="true">
                          {sort?.key === column.key ? (
                            sort.direction === 'ascending' ? (
                              <Icons.ChevronUp />
                            ) : (
                              <Icons.ChevronDown />
                            )
                          ) : (
                            <span className={styles.modelSortIdle}>↕</span>
                          )}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th>Cache</th>
                </tr>
              </thead>
              <tbody>
                {visibleModels.length ? (
                  visibleModels.map((model) => {
                    const isCached = cachedModelIds.includes(model.id);
                    const cacheKey = `${isCached ? 'uncache' : 'cache'}:${model.id}`;
                    const isBusy =
                      modelCacheWork === cacheKey || modelCacheWork?.endsWith(`:${model.id}`);
                    const isSelected = model.id === selectedModelId;

                    return (
                      <tr key={model.id} className={isSelected ? styles.modelTableSelected : ''}>
                        <td className={styles.modelNameCell}>
                          <div className={styles.modelNameContent}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              tabIndex={-1}
                              aria-label={`${model.name} selected`}
                            />
                            <span>
                              <strong>{model.name}</strong>
                              <code>{model.id}</code>
                            </span>
                          </div>
                        </td>
                        <td>{detailValue(model, 'Best for')}</td>
                        <td>{formatSize(model.ramMB)}</td>
                        <td>{formatSize(model.storageMB)}</td>
                        <td>{detailValue(model, 'Speed')}</td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.modelCacheToggle} ${
                              isCached ? styles.modelCacheToggleOn : ''
                            }`}
                            aria-pressed={isCached}
                            onClick={() => {
                              if (isCached) {
                                setModelPendingRemoval(model);
                              } else {
                                onModelCacheAction?.(model, 'cache');
                              }
                            }}
                            disabled={Boolean(modelCacheWork)}
                          >
                            <span className={styles.modelCacheToggleTrack}>
                              <span className={styles.modelCacheToggleThumb} />
                            </span>
                            <span>{isBusy ? 'Working...' : isCached ? 'Cached' : 'Cache'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.modelTableEmpty}>
                      No AI models match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
      <Dialog
        isOpen={Boolean(modelPendingRemoval)}
        title="Remove cached model?"
        message={
          modelPendingRemoval
            ? `${modelPendingRemoval.name} will need to be downloaded again before it can run locally.`
            : ''
        }
        confirmText="Remove cache"
        cancelText="Keep cached"
        type="danger"
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
