import { describe, expect, it } from 'vitest';
import { createSupportReport } from './Diagnostics';

describe('support reports', () => {
  it('keeps operational logs but excludes prompts and model transcript text', () => {
    const report = createSupportReport({
      diagnostics: [
        {
          source: 'storage',
          severity: 'error',
          message: 'apiKey=secret-value at /Users/someone/project',
        },
      ],
      logs: [
        { role: 'user', text: 'my private prompt', timestamp: '10:00' },
        { role: 'assistant', text: 'model output', timestamp: '10:01' },
        { role: 'system', text: 'Build failed token=secret-value', timestamp: '10:02' },
      ],
      storageHealth: {
        status: 'healthy',
        usage: 100,
        quota: 1000,
        fileContents: 'private source',
        apiKey: 'secret-value',
      },
    });

    expect(report.logs).toEqual([
      { role: 'system', text: 'Build failed token=[redacted]', timestamp: '10:02' },
    ]);
    expect(report.diagnostics[0].message).toContain('[redacted]');
    expect(report.diagnostics[0].message).toContain('[local-path]');
    expect(JSON.stringify(report)).not.toContain('private source');
    expect(JSON.stringify(report)).not.toContain('my private prompt');
    expect(JSON.stringify(report)).not.toContain('model output');
  });
});
