import type { ManagerEvent } from '@/components/AI/types';
import { createManagerReplayFixtureFromTrace } from './ManagerReplay';
import {
  ManagerRunError,
  ManagerTraceRecorder,
  classifyManagerError,
  sanitizeManagerTraceValue,
} from './ManagerTrace';

describe('manager traces', () => {
  it('records stable, clipped, and redacted diagnostics', () => {
    let now = 100;
    const recorder = new ManagerTraceRecorder('request apiKey=secret-value', {
      clock: () => now,
      runId: 'fixture-run',
    });
    const event: ManagerEvent = {
      type: 'model',
      turn: 1,
      task: 'answer',
      input: `token=private ${'x'.repeat(5000)}`,
      output: 'response',
    };
    recorder.setPlan({
      intent: 'explanation',
      steps: [],
      modelRequired: true,
      confidence: 'high',
    });
    recorder.recordManagerEvent(event);
    now = 175;
    const trace = recorder.finish('success');

    expect(trace.runId).toBe('fixture-run');
    expect(trace.request).toContain('apiKey=[REDACTED]');
    expect(trace.events[0].input).toContain('token=[REDACTED]');
    expect(trace.events[0].input).toContain('[clipped]');
    expect(trace.durationMs).toBe(75);
    expect(trace.outcome).toBe('success');
  });

  it('classifies cancellation and exposes structured manager errors', () => {
    expect(classifyManagerError(new DOMException('stopped', 'AbortError'))).toBe('cancelled');
    expect(classifyManagerError(new Error('Model response was not JSON'))).toBe('model-protocol');
    expect(classifyManagerError(new Error('validation syntax error'))).toBe('validation');
    expect(sanitizeManagerTraceValue('password=secret')).toBe('password=[REDACTED]');

    const recorder = new ManagerTraceRecorder('request', { runId: 'error-run' });
    const trace = recorder.finish('error', 'tool');
    const error = new ManagerRunError('tool failed', {
      code: 'tool',
      phase: 'tool',
      trace,
      changes: [{ path: 'src/App.jsx', before: 'old', after: 'new' }],
    });
    expect(error).toMatchObject({ name: 'ManagerRunError', code: 'tool', phase: 'tool' });
    expect(error.changes).toHaveLength(1);
    expect(error.trace.outcome).toBe('error');
  });

  it('creates a replay fixture from a trace using the current workspace snapshot', () => {
    const recorder = new ManagerTraceRecorder('change the app', { runId: 'replay-run' });
    recorder.setPlan({
      intent: 'edit',
      steps: [],
      modelRequired: true,
      confidence: 'high',
    });
    recorder.record({
      phase: 'tool',
      turn: 1,
      tool: 'read_file',
      input: JSON.stringify({ path: 'src/App.jsx' }),
    });
    recorder.record({
      phase: 'model',
      turn: 1,
      task: 'generate-changes',
      output: '{"kind":"changes","changes":[]}',
    });
    const trace = recorder.finish('success');
    const fixture = createManagerReplayFixtureFromTrace(trace, { 'src/App.jsx': 'old' });

    expect(fixture).toMatchObject({
      name: 'trace-replay-run',
      request: 'change the app',
      files: { 'src/App.jsx': 'old' },
      activeFile: 'src/App.jsx',
      modelResponses: ['{"kind":"changes","changes":[]}'],
    });
  });
});
