import {
  isStringRecord,
  normalizeDiagnosticEvent,
  normalizeRecoveryCheckpoint,
  redactDiagnosticText,
} from './runtime';

describe('runtime contracts', () => {
  const checkpoint = {
    version: 1,
    savedAt: 1,
    fileContents: { 'src/app.js': 'export default null' },
    pendingDiffs: {},
    openTabs: [],
    activeTabId: null,
  };

  it('accepts only records with string values', () => {
    expect(isStringRecord({ a: 'value' })).toBe(true);
    expect(isStringRecord({ a: 1 })).toBe(false);
    expect(isStringRecord([])).toBe(false);
    expect(isStringRecord(null)).toBe(false);
  });

  it('normalizes compatible checkpoints and rejects malformed fields', () => {
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, projectName: 'Recovered' })).toMatchObject({
      projectName: 'Recovered',
      fileContents: checkpoint.fileContents,
    });
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, version: 2 })).toBeNull();
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, savedAt: Number.NaN })).toBeNull();
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, fileContents: { a: 1 } })).toBeNull();
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, pendingDiffs: [] })).toBeNull();
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, openTabs: {} })).toBeNull();
    expect(normalizeRecoveryCheckpoint({ ...checkpoint, activeTabId: 1 })).toBeNull();
  });

  it('redacts sensitive values and local paths without retaining oversized payloads', () => {
    expect(redactDiagnosticText('token=secret /Users/person/project')).toBe(
      'token=[redacted] [local-path]',
    );
    expect(redactDiagnosticText('x'.repeat(2100))).toHaveLength(2000);
  });

  it('normalizes diagnostics with safe defaults and rejects malformed events', () => {
    expect(
      normalizeDiagnosticEvent({ source: 'compiler', message: 'bad', severity: 'warning' }),
    ).toMatchObject({ severity: 'warning' });
    expect(
      normalizeDiagnosticEvent({ source: 'preview', message: 'bad', severity: 'info' }),
    ).toMatchObject({ severity: 'info' });
    expect(
      normalizeDiagnosticEvent({ source: 'ai', message: 'api_key=value', severity: 'other' }),
    ).toMatchObject({ severity: 'error', message: 'api_key=[redacted]' });
    expect(
      normalizeDiagnosticEvent({ source: 'x', message: 'bad', timestamp: Number.NaN }),
    ).toEqual(expect.objectContaining({ timestamp: expect.any(Number) }));
    expect(normalizeDiagnosticEvent({ source: 1, message: 'bad' })).toBeNull();
    expect(normalizeDiagnosticEvent({ source: 'x', message: 1 })).toBeNull();
  });
});
