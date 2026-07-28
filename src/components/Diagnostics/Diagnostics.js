import { createState } from '@/components/state/State';
import { normalizeDiagnosticEvent, redactDiagnosticText } from '@/contracts/runtime';

const MAX_DIAGNOSTICS = 200;

export const DiagnosticsState = createState('DiagnosticsState');

let diagnosticState = null;

export function bindDiagnosticsState(state) {
  diagnosticState = state;
}

export function reportDiagnostic(event) {
  const normalized = normalizeDiagnosticEvent(event);
  if (!normalized || typeof diagnosticState !== 'function') return;
  diagnosticState((draft) => {
    const events = Array.isArray(draft.events) ? draft.events : [];
    draft.events = [
      ...events,
      { id: `${normalized.timestamp}-${Math.random().toString(36).slice(2, 8)}`, ...normalized },
    ].slice(-MAX_DIAGNOSTICS);
  });
}

export function createSupportReport({ diagnostics = [], logs = [], storageHealth = {} } = {}) {
  const safeStorageHealth = {
    status: typeof storageHealth.status === 'string' ? storageHealth.status : 'unknown',
    layer: typeof storageHealth.layer === 'string' ? storageHealth.layer : null,
    usage: Number.isFinite(storageHealth.usage) ? storageHealth.usage : null,
    quota: Number.isFinite(storageHealth.quota) ? storageHealth.quota : null,
    lastSuccessfulPersistAt: Number.isFinite(storageHealth.lastSuccessfulPersistAt)
      ? storageHealth.lastSuccessfulPersistAt
      : null,
  };

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    storageHealth: safeStorageHealth,
    diagnostics: diagnostics.map(normalizeDiagnosticEvent).filter(Boolean),
    // User and model transcript rows can contain workspace text. Support reports
    // include only operational system logs, never prompt or model content.
    logs: logs
      .filter(({ role }) => role === 'system')
      .slice(-200)
      .map(({ role, text, timestamp }) => ({
        role: String(role),
        text: redactDiagnosticText(text),
        timestamp: String(timestamp || ''),
      })),
  };
}

export function downloadSupportReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `zakamurai-support-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
