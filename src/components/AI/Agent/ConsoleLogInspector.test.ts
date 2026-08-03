import { describe, expect, it } from 'vitest';
import { type ConsoleLogEntry, filterConsoleLogs, formatConsoleLogs } from './ConsoleLogInspector';

describe('ConsoleLogInspector', () => {
  const sampleLogs: ConsoleLogEntry[] = [
    {
      timestamp: 1000,
      level: 'log',
      message: 'App mounted successfully',
      source: 'App.tsx',
      line: 12,
    },
    {
      timestamp: 2000,
      level: 'warn',
      message: 'Deprecation warning: component updated',
      source: 'Header.tsx',
      line: 45,
    },
    {
      timestamp: 3000,
      level: 'error',
      message: 'Uncaught TypeError: Cannot read property of undefined',
      source: 'State.ts',
      line: 88,
      stack: 'TypeError at line 88',
    },
  ];

  it('filters logs by severity level', () => {
    const errors = filterConsoleLogs(sampleLogs, { level: 'error' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TypeError');
  });

  it('filters logs by search query keyword', () => {
    const searchResult = filterConsoleLogs(sampleLogs, { query: 'Header' });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0].level).toBe('warn');
  });

  it('formats console logs cleanly into readable text', () => {
    const formatted = formatConsoleLogs(sampleLogs);
    expect(formatted).toContain('[LOG] App mounted successfully');
    expect(formatted).toContain('[WARN] Deprecation warning');
    expect(formatted).toContain('[ERROR] Uncaught TypeError');
    expect(formatted).toContain('Stack trace:');
  });

  it('returns friendly message when logs array is empty', () => {
    expect(formatConsoleLogs([])).toBe('No matching console logs recorded.');
  });
});
