import { describe, expect, it } from 'vitest';
import { normalizeCompilerDiagnostic } from './diagnostics';

describe('normalizeCompilerDiagnostic', () => {
  it('extracts a safe project-relative source location', () => {
    expect(normalizeCompilerDiagnostic(new Error('src/App.jsx:12:4 Unexpected token'))).toEqual({
      message: 'src/App.jsx:12:4 Unexpected token',
      location: { path: 'src/App.jsx', line: 12, column: 4 },
    });
  });

  it('does not link unsafe paths', () => {
    expect(normalizeCompilerDiagnostic(new Error('../secret.js:1 bad')).location).toBeNull();
  });

  it('preserves a diagnostic without a source location', () => {
    expect(normalizeCompilerDiagnostic('Build timed out').location).toBeNull();
  });
});
