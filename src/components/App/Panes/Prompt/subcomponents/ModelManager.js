import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';
import Dialog from '@/components/ui/Dialog/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip/Tooltip';
import React, { useState } from 'react';

const detailValue = (model, label) => model.details?.find(([key]) => key === label)?.[1] || '';

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
  const [expandedByModelId, setExpandedByModelId] = useState(() => Settings.getAIModelExpanded());

  const toggleExpanded = (modelId) => {
    setExpandedByModelId((current) => {
      const next = {
        ...current,
        [modelId]: current[modelId] === false,
      };
      Settings.setAIModelExpanded(next);
      return next;
    });
  };

  return (
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
        {WEB_LLM_MODELS.map((model) => {
          const isCached = cachedModelIds.includes(model.id);
          const cacheKey = `${isCached ? 'uncache' : 'cache'}:${model.id}`;
          const isBusy = modelCacheWork === cacheKey || modelCacheWork?.endsWith(`:${model.id}`);
          const isSelected = model.id === selectedModelId;
          const bestFor = detailValue(model, 'Best for');
          const system = detailValue(model, 'System');
          const storage = detailValue(model, 'Storage');
          const speed = detailValue(model, 'Speed');
          const isExpanded = expandedByModelId[model.id] !== false;

          return (
            <section
              key={model.id}
              className={`${styles.modelManagerItem} ${isSelected ? styles.modelManagerItemSelected : ''} ${
                isExpanded ? '' : styles.modelManagerItemCollapsed
              }`}
            >
              <div className={styles.modelManagerRail} aria-hidden="true">
                <span />
              </div>
              <div className={styles.modelManagerInfo}>
                <div className={styles.modelManagerTitleRow}>
                  <Tooltip content={isExpanded ? 'Collapse' : 'Expand'}>
                    <button
                      type="button"
                      className={styles.modelManagerDisclosure}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${model.name}`}
                      onClick={() => toggleExpanded(model.id)}
                    >
                      {isExpanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                    </button>
                  </Tooltip>
                  <div className={styles.modelManagerTitleBlock}>
                    <h4>{model.name}</h4>
                    <code>{model.id}</code>
                  </div>
                  <div className={styles.modelManagerBadges}>
                    {isSelected && <span className={styles.modelBadgeSelected}>Selected</span>}
                    {model.recommended && <span>Recommended</span>}
                    {isCached && <span className={styles.modelBadgeCached}>Cached</span>}
                  </div>
                </div>
                {isExpanded && (
                  <>
                    <p className={styles.modelManagerRequirement}>{model.requirement}</p>
                    {bestFor && <p className={styles.modelManagerBestFor}>{bestFor}</p>}
                    <dl className={styles.modelManagerDetails}>
                      <div className={styles.modelManagerDetail}>
                        <dt>System</dt>
                        <dd>{system}</dd>
                      </div>
                      <div className={styles.modelManagerDetail}>
                        <dt>Storage</dt>
                        <dd>{storage}</dd>
                      </div>
                      <div className={styles.modelManagerDetail}>
                        <dt>Speed</dt>
                        <dd>{speed}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
              <div className={styles.modelManagerActions}>
                <div className={styles.modelManagerButtonGroup}>
                  <button
                    type="button"
                    className={`${styles.modelCacheToggle} ${
                      isCached ? styles.modelCacheToggleOn : ''
                    }`}
                    aria-pressed={isCached}
                    onClick={() => onModelCacheAction?.(model, isCached ? 'uncache' : 'cache')}
                    disabled={Boolean(modelCacheWork)}
                  >
                    <span className={styles.modelCacheToggleTrack}>
                      <span className={styles.modelCacheToggleThumb} />
                    </span>
                    <span>{isBusy ? 'Working...' : isCached ? 'Cached' : 'Cache'}</span>
                  </button>
                </div>
              </div>
            </section>
          );
        })}
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
  );
}
