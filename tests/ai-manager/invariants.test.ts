import { describe, expect, it } from 'vitest';
import { runManager } from '@/components/AI/Agent';
import { createFakeModel, createFakeTools } from './harness';

const editResponse = (path: string, content: string) =>
  JSON.stringify({
    kind: 'changes',
    summary: 'Updated by invariant test',
    changes: [{ path, content }],
  });

describe('AI Manager invariants', () => {
  it('never mutates caller files while a run is executing', async () => {
    const files = { 'src/App.jsx': 'old' };
    const model = createFakeModel([editResponse('src/App.jsx', 'new')]);
    const tools = createFakeTools();

    const result = await runManager({
      request: 'change the app',
      files,
      activeFile: 'src/App.jsx',
      model: 'fake',
      modelClient: model.client,
      validate: tools.validate,
    });

    expect(files).toEqual({ 'src/App.jsx': 'old' });
    expect(result.files).toEqual({ 'src/App.jsx': 'new' });
    expect(result.changes).toEqual([{ path: 'src/App.jsx', before: 'old', after: 'new' }]);
  });

  it('bounds model context requests and rejects unsafe paths', async () => {
    const model = createFakeModel([
      JSON.stringify({
        kind: 'request-context',
        requests: Array.from({ length: 12 }, (_, index) => ({
          tool: 'read_file',
          input: { path: index === 0 ? '../secrets.txt' : 'src/App.jsx' },
        })),
      }),
    ]);

    await expect(
      runManager({
        request: 'explain the app',
        files: { 'src/App.jsx': 'export default 1;' },
        model: 'fake',
        modelClient: model.client,
      }),
    ).rejects.toMatchObject({ code: 'context-request' });
    expect(model.calls).toHaveLength(1);
  });

  it('keeps repair attempts bounded after repeated validation failures', async () => {
    const model = createFakeModel([
      editResponse('src/App.jsx', 'bad-1'),
      editResponse('src/App.jsx', 'bad-2'),
      editResponse('src/App.jsx', 'bad-3'),
      editResponse('src/App.jsx', 'bad-4'),
    ]);
    const tools = createFakeTools({
      validation: [
        { status: 'failed', diagnostics: 'syntax 1' },
        { status: 'failed', diagnostics: 'syntax 2' },
        { status: 'failed', diagnostics: 'syntax 3' },
        { status: 'failed', diagnostics: 'syntax 4' },
      ],
    });

    await expect(
      runManager({
        request: 'fix the app',
        files: { 'src/App.jsx': 'old' },
        activeFile: 'src/App.jsx',
        model: 'fake',
        modelClient: model.client,
        validate: tools.validate,
      }),
    ).rejects.toThrow('syntax 3');
    expect(model.calls).toHaveLength(3);
    expect(tools.calls.filter((call) => call.tool === 'validate')).toHaveLength(3);
  });

  it('does not invoke a model for every deterministic tool-only intent', async () => {
    const requests = [
      'list the files in src',
      'search for useState',
      'read package.json',
      'build the project',
      'run the tests',
      'inspect the preview',
      'which project checks are available',
    ];

    for (const request of requests) {
      const model = createFakeModel([]);
      await runManager({
        request,
        files: {
          'package.json': JSON.stringify({ scripts: { build: 'build', test: 'test' } }),
          'src/App.jsx': 'useState();',
        },
        model: 'fake',
        modelClient: model.client,
        runProjectCheck: async () => 'passed',
        inspectPreview: async () => ({ status: 'passed' }),
      });
      expect(model.calls, request).toHaveLength(0);
    }
  });
});
