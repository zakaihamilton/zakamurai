import { askWebLLM } from '@/components/AI/WebLLMAPI';
import { runManager } from '@/components/AI/Agent';

const enabled = process.env.ZAKAMURAI_AI_SMOKE === '1';

describe.skipIf(!enabled)('AI Manager WebLLM smoke test', () => {
  it('runs one bounded model edit through validation and review staging', async () => {
    const result = await runManager({
      request: 'change the title to Smoke Test',
      files: {
        'src/App.jsx': 'export default function App() { return <h1>Old</h1>; }',
      },
      activeFile: 'src/App.jsx',
      model: process.env.ZAKAMURAI_AI_MODEL || 'Qwen3.5-4B-q4f16_1-MLC',
      modelClient: async ({ model, messages, signal, onMetrics, temperature, top_p, max_tokens }) =>
        askWebLLM('', '', null, {
          model,
          messages,
          signal,
          onMetrics,
          requestKind: 'agent',
          temperature,
          top_p,
          max_tokens,
        }),
      validate: async () => ({ status: 'passed', check: 'smoke' }),
    });

    expect(result.trace.outcome).toBe('success');
    expect(result.trace.events.some((event) => event.phase === 'model')).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  }, 180_000);
});
