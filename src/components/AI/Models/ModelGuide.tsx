'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  RECOMMENDED_WEB_LLM_MODEL,
  resolveWebLLMModelId,
  WEB_LLM_MODELS,
} from '@/components/AI/WebLLMModels';
import Settings from '@/components/Storage/Settings';
import type { DeviceCapabilityReport } from '@/contracts/capabilities';
import { detectDeviceCapabilities } from '@/contracts/capabilities';
import styles from './ModelGuide.module.css';
import { formatSize } from './ModelManager/modelUtils';

type ModelGuideProps = {
  initialModelId: string;
};

const getReadinessTitle = (report: DeviceCapabilityReport | null, isChecking: boolean) => {
  if (isChecking) return 'Checking this device…';
  if (!report) return 'Device check unavailable';
  if (report.tier === 'no-ai') return 'Local AI is unavailable in this browser';
  if (report.tier === 'compact-ai') return 'Compact local AI recommended';
  return 'Full local AI available';
};

export default function ModelGuide({ initialModelId }: ModelGuideProps) {
  const router = useRouter();
  const [selectedModelId, setSelectedModelId] = useState(() =>
    resolveWebLLMModelId(initialModelId || RECOMMENDED_WEB_LLM_MODEL.id),
  );
  const [capabilityReport, setCapabilityReport] = useState<DeviceCapabilityReport | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLightTheme, setIsLightTheme] = useState(false);

  const refreshCapabilities = useCallback(async () => {
    setIsChecking(true);
    try {
      setCapabilityReport(await detectDeviceCapabilities(WEB_LLM_MODELS));
    } catch (error) {
      console.warn('[Model guide] Unable to inspect this device:', error);
      setCapabilityReport(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!initialModelId) {
      const savedModelId = Settings.getAIPromptModel('');
      setSelectedModelId(resolveWebLLMModelId(savedModelId || RECOMMENDED_WEB_LLM_MODEL.id));
    }
    setIsLightTheme(Settings.getTheme() === 'light');
    void refreshCapabilities();
  }, [initialModelId, refreshCapabilities]);

  const handleUseModel = (modelId: string) => {
    Settings.setAIPromptModel(modelId);
    router.push('/');
  };

  const recommendedModelName = capabilityReport?.recommendedModelId
    ? WEB_LLM_MODELS.find((model) => model.id === capabilityReport.recommendedModelId)?.name
    : null;

  return (
    <main className={`${styles.page} ${isLightTheme ? 'light' : ''}`}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>
          <span aria-hidden="true">←</span> Back to Welcome
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Local AI model guide</p>
          <h1>Choose a model for your device and your work</h1>
          <p className={styles.intro}>
            Compare what each model is good at, how much GPU memory it needs, and how much browser
            storage its download uses. Models run locally in this browser.
          </p>
        </header>

        <section className={styles.deviceCard} aria-label="Device readiness">
          <div className={styles.deviceHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Your device</p>
              <h2>{getReadinessTitle(capabilityReport, isChecking)}</h2>
            </div>
            <button
              type="button"
              className={styles.recheckButton}
              onClick={() => void refreshCapabilities()}
              disabled={isChecking}
            >
              {isChecking ? 'Checking…' : 'Recheck'}
            </button>
          </div>
          {capabilityReport && (
            <>
              <p className={styles.deviceSummary}>
                {capabilityReport.browser} · {capabilityReport.isMobile ? 'Mobile' : 'Desktop'} ·{' '}
                {capabilityReport.hasWebGPU ? 'WebGPU available' : 'WebGPU unavailable'} ·{' '}
                {capabilityReport.hasWorker ? 'Web Workers available' : 'Web Workers unavailable'}
                {capabilityReport.deviceMemoryGB !== null &&
                  ` · Browser-reported system memory: ~${capabilityReport.deviceMemoryGB} GB`}
                {capabilityReport.storageQuotaMB !== null &&
                  ` · Browser storage quota: ${Math.round(capabilityReport.storageQuotaMB).toLocaleString()} MB`}
              </p>
              {recommendedModelName && (
                <p className={styles.deviceRecommendation}>
                  Suggested for this device: <strong>{recommendedModelName}</strong>
                </p>
              )}
              {capabilityReport.reasons.length > 0 && (
                <ul className={styles.deviceReasons}>
                  {capabilityReport.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p className={styles.memoryNote}>
            GPU memory is an estimate of the model&apos;s VRAM requirement. Apple silicon shares
            memory between the GPU and system; actual available memory varies with browser tabs and
            other apps. Download size uses browser storage.
          </p>
        </section>

        <h2 id="model-list-heading" className={styles.modelsHeading}>
          Available models
        </h2>
        <section className={styles.modelGrid} aria-labelledby="model-list-heading">
          {WEB_LLM_MODELS.map((model) => {
            const isSelected = selectedModelId === model.id;
            const isDeviceRecommended = capabilityReport?.recommendedModelId === model.id;
            const details = model.details.filter(([label]) => label !== 'Storage');

            return (
              <article
                key={model.id}
                className={`${styles.modelCard} ${isSelected ? styles.modelCardSelected : ''}`}
              >
                <div className={styles.modelHeader}>
                  <div>
                    <h2>{model.name}</h2>
                  </div>
                  <div className={styles.badges}>
                    {model.recommended && (
                      <span className={styles.recommendedBadge}>Recommended</span>
                    )}
                    {isDeviceRecommended && (
                      <span className={styles.deviceBadge}>Suggested for device</span>
                    )}
                    {isSelected && <span className={styles.selectedBadge}>Current selection</span>}
                  </div>
                </div>

                <p className={styles.modelSummary}>{model.requirement}</p>

                <dl className={styles.resources}>
                  <div>
                    <dt>Estimated GPU memory</dt>
                    <dd>{formatSize(model.ramMB)}</dd>
                  </div>
                  <div>
                    <dt>Download / cache size</dt>
                    <dd>{formatSize(model.storageMB)}</dd>
                  </div>
                </dl>

                <dl className={styles.modelDetails}>
                  {details.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>

                <button
                  type="button"
                  className={isSelected ? styles.useSelectedButton : styles.useModelButton}
                  aria-label={`Use ${model.name} and return to Welcome`}
                  onClick={() => handleUseModel(model.id)}
                >
                  Use {model.name}
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
