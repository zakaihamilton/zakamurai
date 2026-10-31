import { describe, expect, it } from 'vitest';
import {
  LOCAL_AI_BENCHMARK_CASES,
  evaluateLocalAIBenchmarkCase,
  fingerprintFiles,
  fingerprintPromptMessages,
  getLocalAIBenchmarkModelError,
  getLocalAIBenchmarkSetupError,
} from './LocalBenchmark';

describe('local AI benchmark helpers', () => {
  it('defines a small set of distinct new-project cases', () => {
    expect(LOCAL_AI_BENCHMARK_CASES.map((item) => item.id)).toEqual([
      'todo',
      'dashboard',
      'landing',
    ]);
    expect(new Set(LOCAL_AI_BENCHMARK_CASES.map((item) => item.id)).size).toBe(
      LOCAL_AI_BENCHMARK_CASES.length,
    );
    expect(LOCAL_AI_BENCHMARK_CASES.every((item) => item.features.length > 0)).toBe(true);
  });

  it('fingerprints the model messages deterministically and changes when prompt text changes', () => {
    const initial = [{ role: 'system' as const, content: 'Build a polished interface.' }];
    expect(fingerprintPromptMessages(initial)).toBe(fingerprintPromptMessages(initial));
    expect(fingerprintPromptMessages(initial)).not.toBe(
      fingerprintPromptMessages([{ ...initial[0], content: 'Build a plain interface.' }]),
    );
  });

  it('fingerprints files independent of insertion order', () => {
    expect(fingerprintFiles({ 'src/App.jsx': 'app', 'src/App.css': 'style' })).toBe(
      fingerprintFiles({ 'src/App.css': 'style', 'src/App.jsx': 'app' }),
    );
  });

  it('passes a built, rendered todo app with the requested features', () => {
    const startingFiles = { 'src/App.jsx': 'export default function App() { return null; }' };
    const files = {
      'src/App.jsx': `import { useState } from 'react';
export default function App() {
  const [tasks, setTasks] = useState([]);
  const deleteTask = () => 'remove';
  const toggleTask = () => 'complete';
  const addTask = () => setTasks((items) => [...items, 'new']);
  const filters = ['Completed', 'All', 'Active'];
  return <main><h1>Todo tasks</h1><input /><button>Add task</button>{filters.map((filter) => <button key={filter}>{filter}</button>)}</main>;
}`,
    };
    const result = evaluateLocalAIBenchmarkCase({
      benchmarkCase: LOCAL_AI_BENCHMARK_CASES[0],
      startingFiles,
      files,
      buildStatus: 'passed',
      preview: {
        status: 'passed',
        domSummary: 'Todo tasks All Active Completed Add task',
        elements: ['h1: Todo tasks', 'input: Add a task', 'button: Add task'],
        screenshotCaptured: true,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('checks dashboard and landing page expectations', () => {
    const startingFiles = { 'src/App.jsx': 'starter' };
    const cases = [
      {
        benchmarkCase: LOCAL_AI_BENCHMARK_CASES[1],
        files: {
          'src/App.jsx':
            'export default function App() { const users = 4; const revenue = 10; const recentActivity = []; /* Recent activity */ return <main><h1>Analytics dashboard</h1></main>; }',
          'src/App.module.css': '@media (width <= 640px) { .grid { display: grid; } }',
        },
        preview: {
          status: 'passed',
          domSummary: 'Analytics dashboard Revenue Users Recent activity',
          elements: ['h1: Analytics dashboard'],
          screenshotCaptured: true,
        },
      },
      {
        benchmarkCase: LOCAL_AI_BENCHMARK_CASES[2],
        files: {
          'src/App.jsx':
            'export default function App() { const services = ["Design"]; return <main><h1>Northstar Design Studio</h1><a href="#contact">Contact us</a></main>; }',
          'src/App.module.css': '@media (width <= 640px) { .hero { display: grid; } }',
        },
        preview: {
          status: 'passed',
          domSummary: 'Northstar Design Studio Contact us',
          elements: ['h1: Northstar Design Studio', 'a: Contact us'],
          screenshotCaptured: true,
        },
      },
    ];

    for (const item of cases) {
      const result = evaluateLocalAIBenchmarkCase({
        benchmarkCase: item.benchmarkCase,
        startingFiles,
        files: item.files,
        buildStatus: 'passed',
        preview: item.preview,
      });
      expect(result.passed, item.benchmarkCase.id).toBe(true);
    }
  });

  it('reports build, preview, runtime, and feature failures independently', () => {
    const result = evaluateLocalAIBenchmarkCase({
      benchmarkCase: LOCAL_AI_BENCHMARK_CASES[0],
      startingFiles: { 'src/App.jsx': 'starter' },
      files: { 'src/App.jsx': 'export default function App() { return <main />; }' },
      buildStatus: 'failed',
      preview: {
        status: 'failed',
        domSummary: 'Build failed',
        runtimeErrors: ['ReferenceError: tasks is not defined'],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(
      expect.arrayContaining(['build', 'preview', 'runtime-errors', 'task-entry', 'task-filters']),
    );
  });

  it('explains missing browser runtime requirements', () => {
    expect(
      getLocalAIBenchmarkSetupError({ hasWebGPU: false, hasAdapter: false, hasWorkers: true }),
    ).toMatch(/WebGPU is unavailable/);
    expect(
      getLocalAIBenchmarkSetupError({ hasWebGPU: true, hasAdapter: false, hasWorkers: true }),
    ).toMatch(/compatible adapter/);
    expect(
      getLocalAIBenchmarkSetupError({ hasWebGPU: true, hasAdapter: true, hasWorkers: false }),
    ).toMatch(/Web Workers are unavailable/);
    expect(
      getLocalAIBenchmarkSetupError({ hasWebGPU: true, hasAdapter: true, hasWorkers: true }),
    ).toBe(null);
  });

  it('explains when a selected model is unavailable', () => {
    expect(getLocalAIBenchmarkModelError('missing-model', ['available-model'])).toBe(
      'Unknown local model: missing-model',
    );
    expect(getLocalAIBenchmarkModelError('available-model', ['available-model'])).toBe(null);
  });
});
