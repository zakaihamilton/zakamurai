import { createState } from '@/components/state/State';
import type { StateStore } from '@/components/state/types';
import { normalizeDiagnosticEvent, redactDiagnosticText } from '@/contracts/runtime';
import type {
  DiagnosticsStateShape,
  LogEntry,
  StorageHealthStateShape,
} from '@/types/domain-types';

const MAX_DIAGNOSTICS = 200;

export const DiagnosticsState = createState<DiagnosticsStateShape>('DiagnosticsState');

let diagnosticState: StateStore<DiagnosticsStateShape> | null = null;

export function bindDiagnosticsState(state: StateStore<DiagnosticsStateShape> | null) {
  diagnosticState = state;
}

export function reportDiagnostic(event: unknown) {
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

type SupportReportInput = {
  diagnostics?: unknown[];
  logs?: LogEntry[];
  storageHealth?: Partial<StorageHealthStateShape> & Record<string, unknown>;
};

export function createSupportReport({
  diagnostics = [],
  logs = [],
  storageHealth = {},
}: SupportReportInput = {}) {
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

export function downloadSupportReport(report: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `zakamurai-support-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
