import { describe, expect, it, vi } from 'vitest';
import { createManagerToolContext, executeManagerTool, formatContextResults } from './ManagerTools';

const files = {
  'package.json': JSON.stringify({ scripts: { build: 'next build', test: 'vitest run' } }),
  'src/App.jsx': 'export const answer = 42;\n',
};

describe('manager tools', () => {
  it('lists, reads, searches, and clips workspace results', async () => {
    const context = createManagerToolContext(files, null, {});
    expect((await executeManagerTool({ tool: 'list_files' }, context)).value).toContain(
      'src/App.jsx',
    );
    expect(
      (await executeManagerTool({ tool: 'read_file', input: { path: 'src/App.jsx' } }, context))
        .value,
    ).toContain('42');
    expect(
      (await executeManagerTool({ tool: 'search_workspace', input: { query: 'answer' } }, context))
        .text,
    ).toContain('src/App.jsx');
    expect(formatContextResults([{ tool: 'read_file', value: 'x', text: 'x' }])).toContain(
      '[read_file]',
    );
    expect(
      formatContextResults([
        {
          tool: 'read_file',
          input: { path: 'src/App.jsx' },
          value: 'x',
          text: 'x',
        },
      ]),
    ).toContain('[read_file {"path":"src/App.jsx"}]');
  });

  it('supports semantic retrieval and unavailable fallbacks', async () => {
    const retrieveContext = vi
      .fn()
      .mockResolvedValue([{ filePath: 'src/App.jsx', content: 'answer', score: 0.9 }]);
    const context = createManagerToolContext(files, null, { retrieveContext });
    const semantic = await executeManagerTool(
      { tool: 'search_semantic', input: { query: 'answer', k: 20 } },
      context,
    );
    expect(semantic.text).toContain('0.900');
    expect(retrieveContext).toHaveBeenCalledWith('answer', 10);
    const unavailable = await executeManagerTool(
      { tool: 'search_semantic', input: { query: 'answer' } },
      createManagerToolContext(files, null, {}),
    );
    expect(unavailable.text).toContain('unavailable');
  });

  it('runs eligible project checks and exposes validation and preview fallbacks', async () => {
    const runProjectCheck = vi.fn().mockResolvedValue('all good');
    const validate = vi.fn().mockResolvedValue({ status: 'passed', check: 'build' });
    const inspectPreview = vi.fn().mockResolvedValue({ status: 'passed', title: 'Preview' });
    const context = createManagerToolContext(files, null, {
      runProjectCheck,
      validate,
      inspectPreview,
    });
    expect((await executeManagerTool({ tool: 'list_project_checks' }, context)).value).toEqual([
      'build',
      'test',
    ]);
    expect(
      (await executeManagerTool({ tool: 'run_project_check', input: { check: 'test' } }, context))
        .value,
    ).toMatchObject({ status: 'passed' });
    expect(runProjectCheck).toHaveBeenCalledWith('test', files);
    expect((await executeManagerTool({ tool: 'validate' }, context)).value).toMatchObject({
      status: 'passed',
    });
    expect((await executeManagerTool({ tool: 'inspect_preview' }, context)).value).toMatchObject({
      title: 'Preview',
    });
    expect(
      (await executeManagerTool({ tool: 'validate' }, createManagerToolContext(files, null, {})))
        .text,
    ).toContain('unavailable');
    expect(
      (
        await executeManagerTool(
          { tool: 'inspect_preview' },
          createManagerToolContext(files, null, {}),
        )
      ).text,
    ).toContain('unavailable');
  });

  it('normalizes an unavailable check when no eligible script exists', async () => {
    const context = createManagerToolContext({}, null, {});
    const result = await executeManagerTool(
      { tool: 'run_project_check', input: { request: 'run tests' } },
      context,
    );
    expect(result.value).toMatchObject({ status: 'unavailable' });
  });

  it('clips large tool output and rejects unsupported registry entries', async () => {
    const large = await executeManagerTool(
      { tool: 'read_file', input: { path: 'large.txt' } },
      createManagerToolContext({ 'large.txt': 'x'.repeat(12001) }, null, {}),
    );
    expect(large.text).toContain('[truncated]');
    await expect(
      executeManagerTool(
        { tool: 'unsupported' as never },
        createManagerToolContext(files, null, {}),
      ),
    ).rejects.toThrow(/Unsupported manager tool/);
  });

  it('normalizes a check runner that returns no output', async () => {
    const runProjectCheck = vi.fn().mockResolvedValue(undefined);
    const result = await executeManagerTool(
      { tool: 'run_project_check', input: { check: 'test' } },
      createManagerToolContext(files, null, { runProjectCheck }),
    );
    expect(result.value).toMatchObject({ status: 'passed' });
  });
});
