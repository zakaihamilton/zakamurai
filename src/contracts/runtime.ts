export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticEvent = {
  source: string;
  severity: DiagnosticSeverity;
  message: string;
  details?: string;
  timestamp?: number;
};

export type RecoveryCheckpoint = {
  version: 1;
  id?: string;
  savedAt: number;
  reason?: 'manual' | 'ai-change' | 'storage-recovery';
  projectName?: string;
  fileContents: Record<string, string>;
  pendingDiffs: Record<string, unknown>;
  pendingDeletions?: Record<string, unknown>;
  openTabs: unknown[];
  activeTabId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

export function normalizeRecoveryCheckpoint(value: unknown): RecoveryCheckpoint | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.savedAt !== 'number' ||
    !Number.isFinite(value.savedAt)
  ) {
    return null;
  }
  if (!isStringRecord(value.fileContents) || !isRecord(value.pendingDiffs)) return null;
  if (value.pendingDeletions !== undefined && !isRecord(value.pendingDeletions)) return null;
  if (!Array.isArray(value.openTabs)) return null;
  if (value.activeTabId !== null && typeof value.activeTabId !== 'string') return null;
  return {
    version: 1,
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    savedAt: value.savedAt,
    ...(value.reason === 'manual' ||
    value.reason === 'ai-change' ||
    value.reason === 'storage-recovery'
      ? { reason: value.reason }
      : {}),
    ...(typeof value.projectName === 'string' ? { projectName: value.projectName } : {}),
    fileContents: value.fileContents,
    pendingDiffs: value.pendingDiffs,
    ...(value.pendingDeletions ? { pendingDeletions: value.pendingDeletions } : {}),
    openTabs: value.openTabs,
    activeTabId: value.activeTabId,
  };
}

const SENSITIVE_VALUE =
  /((?:["'])?(?:authorization|access[_-]?token|refresh[_-]?token|token|api[_-]?key|password|secret)(?:["'])?\s*[:=]\s*)(?:["'][^"']*["']|(?:bearer|basic)\s+[^\s,;}\]]+|[^\s,;}\]]+)/gi;
const ABSOLUTE_PATH = /(?:file:\/\/)?(?:[A-Z]:\\|\/Users\/|\/home\/)[^\s\n]*/g;

export function redactDiagnosticText(value: unknown): string {
  return String(value ?? '')
    .replace(SENSITIVE_VALUE, '$1[redacted]')
    .replace(ABSOLUTE_PATH, '[local-path]')
    .slice(0, 2000);
}

export function normalizeDiagnosticEvent(value: unknown): DiagnosticEvent | null {
  if (!isRecord(value) || typeof value.source !== 'string' || typeof value.message !== 'string') {
    return null;
  }
  const severity: DiagnosticSeverity =
    value.severity === 'warning' || value.severity === 'info' ? value.severity : 'error';
  return {
    source: value.source.slice(0, 80),
    severity,
    message: redactDiagnosticText(value.message),
    ...(typeof value.details === 'string' ? { details: redactDiagnosticText(value.details) } : {}),
    timestamp: Number.isFinite(value.timestamp) ? Number(value.timestamp) : Date.now(),
  };
}
