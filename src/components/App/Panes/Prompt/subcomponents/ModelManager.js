import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import Dialog from '@/components/Widgets/Dialog/Dialog';
import React from 'react';

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
  return (
    <Dialog
      isOpen={isOpen}
      title="AI Models"
      onCancel={onCancel}
      footer={null}
      className={styles.modelDialog}
    >
      <div className={styles.modelManager}>
        {WEB_LLM_MODELS.map((model) => {
          const isCached = cachedModelIds.includes(model.id);
          const cacheKey = `${isCached ? 'uncache' : 'cache'}:${model.id}`;
          const isBusy = modelCacheWork === cacheKey || modelCacheWork?.endsWith(`:${model.id}`);
          const isSelected = model.id === selectedModelId;

          return (
            <section key={model.id} className={styles.modelManagerItem}>
              <div className={styles.modelManagerInfo}>
                <div className={styles.modelManagerTitleRow}>
                  <h4>{model.name}</h4>
                  <div className={styles.modelManagerBadges}>
                    {model.recommended && <span>Recommended</span>}
                    {isSelected && <span>Selected</span>}
                    {isCached && <span>Cached</span>}
                  </div>
                </div>
                <p>{model.requirement}</p>
                <dl className={styles.modelManagerDetails}>
                  {model.details?.map(([label, value]) => (
                    <div key={label} className={styles.modelManagerDetail}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className={styles.modelManagerActions}>
                <code>{model.id}</code>
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
