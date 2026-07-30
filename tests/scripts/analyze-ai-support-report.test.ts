import { describe, expect, it } from 'vitest';
import {
  extractWebLLMMetrics,
  summarizeWebLLMMetrics,
} from '../../scripts/analyze-ai-support-report';

describe('analyze-ai-support-report', () => {
  it('extracts WebLLM metrics and summarizes latency, recovery, and heap data', () => {
    const samples = extractWebLLMMetrics({
      diagnostics: [
        {
          source: 'webllm',
          message: 'Local AI completion success',
          details: JSON.stringify({
            requestKind: 'completion',
            modelId: 'model-a',
            outcome: 'success',
            totalMs: 100,
            initializationMs: 50,
            timeToFirstTokenMs: 20,
            recoveryCount: 0,
            jsHeapUsedMBAtEnd: 120,
            jsHeapDeltaMB: 2,
          }),
        },
        {
          source: 'webllm',
          message: 'Local AI agent success',
          details: JSON.stringify({
            requestKind: 'agent',
            modelId: 'model-a',
            outcome: 'success',
            totalMs: 300,
            timeToFirstTokenMs: 60,
            recoveryCount: 1,
            jsHeapUsedMBAtEnd: 140,
            jsHeapDeltaMB: 6,
          }),
        },
        { source: 'storage', message: 'ignored', details: '{}' },
        { source: 'webllm', message: 'Local AI invalid', details: '{' },
      ],
    });

    expect(samples).toHaveLength(2);
    expect(summarizeWebLLMMetrics(samples)).toMatchObject({
      requestCount: 2,
      outcomes: { success: 2 },
      initializationCount: 1,
      recoveredRequestCount: 1,
      totalRecoveryCount: 1,
      averageTotalMs: 200,
      p95TotalMs: 300,
      averageTimeToFirstTokenMs: 40,
      averageJSHeapDeltaMB: 4,
      maxJSHeapUsedMB: 140,
      byRequestKind: {
        completion: { count: 1 },
        agent: { count: 1 },
      },
    });
  });
});
