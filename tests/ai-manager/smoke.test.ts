import { runManager } from '@/components/AI/Agent';
import { askWebLLM } from '@/components/AI/WebLLMAPI';

const enabled = process.env.ZAKAMURAI_AI_SMOKE === '1';

describe.skipIf(!enabled)('AI Manager WebLLM smoke test', () => {
  it('runs a todo-app request through the action loop and validation', async () => {
    const result = await runManager({
      request: 'create a todo app',
      files: {
        'package.json': '{"dependencies":{"react":"latest"}}',
        'src/App.jsx': 'export default function App() { return null; }',
      },
      model: process.env.ZAKAMURAI_AI_MODEL || 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      modelClient: async ({
        model,
        messages,
        signal,
        onMetrics,
        temperature,
        top_p,
        max_tokens,
        contextWindowSize,
      }) =>
        askWebLLM('', '', null, {
          model,
          messages,
          signal,
          onMetrics,
          requestKind: 'agent',
          temperature,
          top_p,
          max_tokens,
          contextWindowSize,
        }),
      validate: async () => ({ status: 'passed', check: 'smoke' }),
    });

    expect(result.trace.outcome).toBe('success');
    expect(result.trace.events.some((event) => event.phase === 'model')).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.files['src/App.jsx']).not.toContain('Your implementation');
    expect(result.files['src/App.jsx']).toMatch(/useState|tasks|todo/i);
  }, 180_000);
});
