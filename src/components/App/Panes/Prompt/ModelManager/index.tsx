import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { useDeviceCapabilities } from '@/components/AI/useDeviceCapabilities';
import Dialog from '@/components/ui/Dialog';
import { useMemo, useState } from 'react';
import type { ModelManagerProps, ModelOption, ModelSortKey, ModelSortState } from '../prompt-types';
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
}: ModelManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<ModelSortState>(null);
  const [modelPendingRemoval, setModelPendingRemoval] = useState<ModelOption | null>(null);
  const { capabilityReport, isChecking, refreshCapabilities } = useDeviceCapabilities({
    enabled: isOpen,
  });

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
          ? leftValue - (rightValue as number)
          : String(leftValue).localeCompare(String(rightValue), undefined, {
              numeric: true,
              sensitivity: 'base',
            });
      return sort.direction === 'ascending' ? comparison : -comparison;
    });
  }, [cachedModelIds, searchTerm, selectedModelId, sort]);

  const toggleSort = (key: ModelSortKey) => {
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
        onConfirm={onCancel}
        footer={null}
        className={styles.modelDialog}
      >
        <div className={styles.modelManager}>
          <div className={styles.modelManagerIntro}>
            <p>Choose the local browser model that matches this device and the kind of edit.</p>
          </div>
          {capabilityReport ? (
            <section className={styles.capabilityCard} aria-label="Device AI capability">
              <div className={styles.capabilityHeader}>
                <strong>
                  {capabilityReport.tier === 'no-ai'
                    ? 'Local AI unavailable'
                    : capabilityReport.tier === 'compact-ai'
                      ? 'Compact local AI recommended'
                      : 'Full local AI available'}
                </strong>
                <button
                  type="button"
                  onClick={() => void refreshCapabilities()}
                  disabled={isChecking}
                >
                  {isChecking ? 'Checking…' : 'Recheck'}
                </button>
              </div>
              <p className={styles.capabilitySummary}>
                {capabilityReport.browser} · {capabilityReport.isMobile ? 'Mobile' : 'Desktop'} ·{' '}
                {capabilityReport.hasWebGPU ? 'WebGPU ready' : 'WebGPU unavailable'}
                {capabilityReport.recommendedModelId
                  ? ` · Recommended: ${WEB_LLM_MODELS.find((model) => model.id === capabilityReport.recommendedModelId)?.name || capabilityReport.recommendedModelId}`
                  : ''}
              </p>
              <details className={styles.capabilityDetails}>
                <summary>View device details</summary>
                <ul>
                  <li>Workers: {capabilityReport.hasWorker ? 'available' : 'unavailable'}</li>
                  <li>
                    Device memory:{' '}
                    {capabilityReport.deviceMemoryGB === null
                      ? 'not reported'
                      : `${capabilityReport.deviceMemoryGB} GB`}
                  </li>
                  <li>
                    Browser storage:{' '}
                    {capabilityReport.storageQuotaMB === null
                      ? 'quota unavailable'
                      : `${Math.round(capabilityReport.storageQuotaMB).toLocaleString()} MB quota`}
                  </li>
                  {capabilityReport.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            </section>
          ) : (
            <section className={styles.capabilityCard} aria-label="Device AI capability">
              <strong>Checking local AI readiness…</strong>
              <p className={styles.capabilitySummary}>
                Zakamurai is checking this browser for WebGPU, workers, and available storage.
              </p>
            </section>
          )}
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
