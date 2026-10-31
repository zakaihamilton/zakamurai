import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeLocalAIBenchmarkReport } from '../../scripts/ai-bench-report';

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe('local AI benchmark report writer', () => {
  it('writes the model, cases, traces, validation evidence, and generated files as JSON', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'zakamurai-ai-bench-'));
    const reportPath = path.join(temporaryDirectory, 'run-1', 'report.json');
    const report = {
      version: 1,
      status: 'failed',
      model: 'local-model',
      cases: [
        {
          id: 'todo',
          promptFingerprints: [{ task: 'generate-changes', fingerprint: 'fnv1a-1234' }],
          trace: { outcome: 'error', events: [{ phase: 'validation' }] },
          validationRuns: [{ fingerprint: 'fnv1a-abcd', status: 'failed' }],
          files: { 'src/App.jsx': 'export default function App() {}' },
        },
      ],
    };

    await writeLocalAIBenchmarkReport(reportPath, report);

    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual(report);
  });
});
