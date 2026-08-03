import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { useDeviceCapabilities } from '@/components/AI/useDeviceCapabilities';
import { Icons } from '@/components/ui/Icons';
import styles from './DeviceReadiness.module.css';

const readinessLabel = {
  'full-ai': 'Full local AI available',
  'compact-ai': 'Compact local AI recommended',
  'no-ai': 'Local AI needs attention',
} as const;

export default function ProjectDeviceReadiness() {
  const { capabilityReport, isChecking, refreshCapabilities } = useDeviceCapabilities();

  if (!capabilityReport) {
    return (
      <section className={styles.panel} aria-label="Device and AI readiness" aria-busy="true">
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden="true">
            <Icons.Brain size={20} />
          </span>
          <div>
            <span className={styles.eyebrow}>Device readiness</span>
            <h2>Checking local AI support…</h2>
          </div>
        </div>
        <p className={styles.summary}>
          Zakamurai is checking this browser for the capabilities needed by local AI models.
        </p>
      </section>
    );
  }

  const recommendedModel = WEB_LLM_MODELS.find(
    (model) => model.id === capabilityReport.recommendedModelId,
  );

  return (
    <section className={styles.panel} aria-label="Device and AI readiness">
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden="true">
            <Icons.Brain size={20} />
          </span>
          <div>
            <span className={styles.eyebrow}>Device readiness</span>
            <h2>{readinessLabel[capabilityReport.tier]}</h2>
          </div>
        </div>
        <button
          className={styles.recheck}
          type="button"
          onClick={() => void refreshCapabilities()}
          disabled={isChecking}
        >
          {isChecking ? 'Checking…' : 'Recheck'}
        </button>
      </div>

      <p className={styles.summary}>
        {capabilityReport.browser} · {capabilityReport.isMobile ? 'Mobile' : 'Desktop'} ·{' '}
        {capabilityReport.hasWebGPU ? 'WebGPU ready' : 'WebGPU unavailable'}
      </p>

      <dl className={styles.metrics}>
        <div>
          <dt>Workers</dt>
          <dd>{capabilityReport.hasWorker ? 'Available' : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Device memory</dt>
          <dd>
            {capabilityReport.deviceMemoryGB === null
              ? 'Not reported'
              : `${capabilityReport.deviceMemoryGB} GB`}
          </dd>
        </div>
        <div>
          <dt>Browser storage</dt>
          <dd>
            {capabilityReport.storageQuotaMB === null
              ? 'Quota unavailable'
              : `${Math.round(capabilityReport.storageQuotaMB).toLocaleString()} MB quota`}
          </dd>
        </div>
        <div>
          <dt>Recommended model</dt>
          <dd>{recommendedModel?.name || 'No model selected'}</dd>
        </div>
      </dl>

      {capabilityReport.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {capabilityReport.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
