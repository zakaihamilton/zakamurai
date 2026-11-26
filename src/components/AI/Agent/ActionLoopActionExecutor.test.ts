import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunAgentOptions } from '@/components/AI/types';
import { buildTaskContract } from '../ReliabilityContracts';
import { executeActionStep } from './ActionLoopActionExecutor';
import { AgentExecutionError } from './ActionLoopErrors';
import { type ActionLoopState, createActionLoopState } from './ActionLoopState';

const makeState = async (
  overrides: Partial<ActionLoopState> & {
    files?: Record<string, string>;
    request?: string;
    model?: string;
    priorContext?: string;
    activeFile?: string | null;
    scope?: 'file' | 'project';
    validate?: RunAgentOptions['validate'];
    runProjectCheck?: RunAgentOptions['runProjectCheck'];
    inspectPreview?: RunAgentOptions['inspectPreview'];
    retrieveContext?: RunAgentOptions['retrieveContext'];
  } = {},
): Promise<ActionLoopState> => {
  const {
    files = {
      'src/App.jsx': 'export default function App() { return <main>App</main>; }',
      'package.json': JSON.stringify({
        name: 'demo',
        scripts: { test: 'vitest run' },
        dependencies: { react: '^19.0.0' },
      }),
    },
    request = 'update the app',
    model = 'Qwen3.5-9B-q4f16_1-MLC',
    priorContext = '',
    activeFile = 'src/App.jsx',
    scope = 'project',
    validate,
    runProjectCheck,
    inspectPreview,
    retrieveContext,
    ...rest
  } = overrides;
  const state = await createActionLoopState({
    request,
    scope,
    files,
    model,
    priorContext,
    activeFile,
    validate,
    runProjectCheck,
    inspectPreview,
    retrieveContext,
    modelClient: vi.fn(),
    onEvent: vi.fn(),
  });
  Object.assign(state, rest);
  return state;
};

describe('ActionLoopActionExecutor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes workspace inspection tools: list_files, search_workspace, search_semantic, read_file', async () => {
    const retrieveContext = vi
      .fn()
      .mockResolvedValue([
        { path: 'src/App.jsx', text: 'export default function App', score: 0.9 },
      ]);
    const state = await makeState({ retrieveContext });

    expect(
      await executeActionStep(state, 1, { action: 'list_files', query: '*.jsx' }, 'fp-list'),
    ).toEqual({ kind: 'proceed' });
    expect(state.messages.at(-1)?.content).toContain('src/App.jsx');
    expect(state.lastSuccessfulFingerprint).toBe('fp-list');

    expect(
      await executeActionStep(state, 2, { action: 'search_workspace', query: 'main' }, 'fp-search'),
    ).toEqual({ kind: 'proceed' });
    expect(state.messages.at(-1)?.content).toContain('src/App.jsx:1');

    expect(
      await executeActionStep(
        state,
        3,
        { action: 'search_semantic', query: 'App', k: 3 },
        'fp-sem',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(retrieveContext).toHaveBeenCalledWith('App', 3);

    // search_semantic unavailable throws and records error observation
    state.retrieveContext = undefined;
    expect(
      await executeActionStep(state, 4, { action: 'search_semantic', query: 'App' }, 'fp-sem-err'),
    ).toEqual({ kind: 'continue' });
    expect(state.messages.at(-1)?.content).toContain('Semantic search is unavailable');

    // read_file existing vs missing
    expect(
      await executeActionStep(state, 5, { action: 'read_file', path: 'src/App.jsx' }, 'fp-read1'),
    ).toEqual({ kind: 'proceed' });
    expect(state.lastReadContents.get('src/App.jsx')).toContain('function App');

    expect(
      await executeActionStep(
        state,
        6,
        { action: 'read_file', path: 'src/Missing.jsx' },
        'fp-read2',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(state.lastReadContents.has('src/Missing.jsx')).toBe(false);
    expect(state.messages.at(-1)?.content).toContain('File not found: src/Missing.jsx');

    // read_file throwing "File not found:" triggers recovery guidance
    state.workspace.read = vi.fn(() => {
      throw new Error('File not found: src/App.jsx');
    });
    expect(
      await executeActionStep(state, 7, { action: 'read_file', path: 'src/App.jsx' }, 'fp-read3'),
    ).toEqual({ kind: 'continue' });
    expect(state.messages.at(-1)?.content).toContain('The requested file is absent');
  });

  it('executes replace_file_content, delete_file, and finish actions', async () => {
    const state = await makeState({
      files: {
        'src/App.jsx':
          "import styles from './App.module.css'; export default function App() { return <main className={styles.app}>Old</main>; }",
        'src/App.module.css': '.app { color: black; }',
        'src/unused.js': 'export const unused = 1;',
      },
    });

    expect(
      await executeActionStep(
        state,
        1,
        {
          action: 'replace_file_content',
          path: 'src/App.jsx',
          search: '>Old<',
          replace: '>New<',
        },
        'fp-rep',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(state.workspace.files['src/App.jsx']).toContain('>New<');

    // Deleting an imported CSS Module triggers delete recovery message
    expect(
      await executeActionStep(
        state,
        2,
        { action: 'delete_file', path: 'src/App.module.css' },
        'fp-del-css',
      ),
    ).toEqual({ kind: 'continue' });
    expect(state.messages.at(-1)?.content).toContain(
      'Update or remove its importing component files first',
    );

    // Deleting an unused file succeeds
    expect(
      await executeActionStep(state, 3, { action: 'delete_file', path: 'src/unused.js' }, 'fp-del'),
    ).toEqual({ kind: 'proceed' });
    expect(state.workspace.files['src/unused.js']).toBeUndefined();

    // finish delegates to handleFinishAction
    const finishOutcome = await executeActionStep(
      state,
      4,
      { action: 'finish', summary: 'Updated app' },
      'fp-fin',
    );
    expect(finishOutcome.kind).toBe('return');
  });

  it('executes validate, project checks, preview, console logs, file symbols, and package management', async () => {
    const runProjectCheck = vi.fn().mockResolvedValue('All tests passed');
    const state = await makeState({
      files: {
        'src/App.jsx': 'export default function App() { return <main>App</main>; }',
        'package.json': JSON.stringify({
          name: 'demo',
          scripts: { test: 'vitest run' },
          dependencies: { react: '^19.0.0' },
        }),
        '.console.log': '[INFO] boot\n[WARN] slow render\n[ERROR] uncaught boom',
      },
      runProjectCheck,
      inspectPreview: vi.fn().mockResolvedValue({
        elements: ['main: app'],
        screenshotCaptured: true,
      }),
    });

    // validate failed sets forced recovery fields
    state.runValidation = vi.fn().mockResolvedValue('{"status":"failed","diagnostics":"Bad"}');
    expect(await executeActionStep(state, 1, { action: 'validate' }, 'fp-v1')).toEqual({
      kind: 'proceed',
    });
    expect(state.forcedWriteRecoveryPending).toBe(true);
    expect(state.failedWritePath).toBe('src/App.jsx');

    // validate passed with staged changes appends finish hint
    state.workspace.write(
      'src/App.jsx',
      'export default function App() { return <main>Ok</main>; }',
    );
    state.validationState.lastValidationFailed = false;
    state.runValidation = vi.fn().mockResolvedValue('{"status":"passed","check":"build"}');
    expect(await executeActionStep(state, 2, { action: 'validate' }, 'fp-v2')).toEqual({
      kind: 'proceed',
    });
    expect(state.messages.at(-1)?.content).toContain('Your next action must be finish');

    // list_project_checks and run_project_check
    expect(await executeActionStep(state, 3, { action: 'list_project_checks' }, 'fp-lpc')).toEqual({
      kind: 'proceed',
    });
    expect(state.messages.at(-1)?.content).toContain('test');

    expect(
      await executeActionStep(state, 4, { action: 'run_project_check', check: 'test' }, 'fp-rpc'),
    ).toEqual({ kind: 'proceed' });
    expect(runProjectCheck).toHaveBeenCalled();

    // No eligible project checks fallback
    delete state.workspace.files['package.json'];
    expect(
      await executeActionStep(state, 5, { action: 'list_project_checks' }, 'fp-lpc-empty'),
    ).toEqual({ kind: 'proceed' });
    expect(state.messages.at(-1)?.content).toContain('No eligible project checks.');

    // inspect_preview, inspect_console_logs, get_file_symbols, manage_packages
    expect(await executeActionStep(state, 6, { action: 'inspect_preview' }, 'fp-prev')).toEqual({
      kind: 'proceed',
    });
    expect(
      await executeActionStep(
        state,
        7,
        { action: 'inspect_console_logs', level: 'error' },
        'fp-logs',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(state.messages.at(-1)?.content).toContain('uncaught boom');

    expect(
      await executeActionStep(
        state,
        8,
        { action: 'get_file_symbols', path: 'src/App.jsx' },
        'fp-sym',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(state.messages.at(-1)?.content).toContain('App');

    state.workspace.files['package.json'] = JSON.stringify({ name: 'demo', dependencies: {} });
    expect(
      await executeActionStep(
        state,
        9,
        { action: 'manage_packages', query: 'add', packageName: 'clsx', version: '^2.0.0' },
        'fp-pkg-add',
      ),
    ).toEqual({ kind: 'proceed' });
    expect(state.workspace.files['package.json']).toContain('clsx');

    expect(
      await executeActionStep(
        state,
        10,
        { action: 'manage_packages', query: 'list' },
        'fp-pkg-list',
      ),
    ).toEqual({ kind: 'proceed' });
  });

  describe('executeWriteFile branches', () => {
    it('normalizes side-effect CSS, appends rewritten inline styles, merges missing CSS rules, and writes root tokens', async () => {
      const state = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        priorContext: '[list_files]\nsrc/App.jsx',
        request: 'update card styling',
        files: {
          'src/App.jsx': 'export default function App() { return null; }',
          'src/App.module.css': '.existing { color: black; }',
          'src/Extra.module.css': '.other { color: gray; }',
          'src/index.css': 'body { margin: 0; }',
        },
      });
      state.finishContextReadyWrite = vi.fn().mockResolvedValue(null);

      // Side-effect CSS + incomplete CSS module rules
      await executeActionStep(
        state,
        1,
        {
          action: 'write_file',
          path: 'src/App.jsx',
          content:
            "import './App.css'; import './Fresh.css'; export default function App() { return <main className=\"card\">Hello</main>; }",
        },
        'fp-w1',
      );
      expect(state.workspace.files['src/App.module.css']).toContain('.card');
      expect(state.workspace.files['src/Fresh.module.css']).toBeDefined();
      expect(state.context.toString()).toContain('style_generation');

      // Writing a non-root component when src/App.module.css lacks :root triggers ensureProjectRootTokens
      const rootTokensState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        priorContext: '[list_files]\nsrc/App.jsx',
        request: 'update card styling',
        files: {
          'src/App.jsx': 'export default function App() { return null; }',
          'src/App.module.css': '.app { color: black; }',
        },
      });
      rootTokensState.finishContextReadyWrite = vi.fn().mockResolvedValue(null);
      await executeActionStep(
        rootTokensState,
        1,
        {
          action: 'write_file',
          path: 'src/Card.jsx',
          content: 'export default function Card() { return <div>Card</div>; }',
        },
        'fp-w-tokens',
      );
      expect(rootTokensState.workspace.files['src/App.module.css']).toContain(':global(:root)');

      // Standard validation failure when recoveryWritePath returns null (no JSX files)
      const emptyFailState = await makeState({ files: {} });
      emptyFailState.runValidation = vi.fn().mockResolvedValue('{"status":"failed"}');
      expect(
        await executeActionStep(emptyFailState, 1, { action: 'validate' }, 'fp-v-empty'),
      ).toEqual({
        kind: 'proceed',
      });
      expect(emptyFailState.failedWritePath).toBe('');
      expect(emptyFailState.forcedWriteRecoveryPending).toBe(false);

      // Rewritten inline styles append to existing stylesheet
      await executeActionStep(
        state,
        3,
        {
          action: 'write_file',
          path: 'src/App.jsx',
          content:
            'export default function App() { return <main style={{ padding: 12 }}>Inline</main>; }',
        },
        'fp-w2',
      );
      expect(state.workspace.files['src/App.module.css']).toContain('.inline0');
      expect(state.workspace.files['src/App.module.css']).toContain('.existing');

      // hostAssistedWrite auto-finishes when finishContextReadyWrite returns a result
      const autoResult = {
        changes: state.workspace.changes(),
        files: state.workspace.files,
        summary: 'Auto-finished',
        events: 4,
        workspace: state.workspace,
      };
      state.finishContextReadyWrite = vi.fn().mockResolvedValue(autoResult);
      const outcome = await executeActionStep(
        state,
        4,
        {
          action: 'write_file',
          path: 'src/Panel.jsx',
          content:
            'export default function Panel() { return <button type="button" onClick={() => {}}>Click</button>; }',
        },
        'fp-w3',
      );
      expect(outcome).toEqual({ kind: 'return', result: autoResult });
      expect(state.workspace.files['src/Panel.module.css']).toContain('.button');
    });

    it('queues deferredSourceWrite on missing CSS Module and flushes or requests recovery when stylesheet arrives', async () => {
      const state = await makeState({
        request: 'update widget',
        files: {
          'src/entry.js': 'export default function entry() { return null; }',
        },
      });

      // Missing CSS module with valid JS queues deferredSourceWrite
      const queued = await executeActionStep(
        state,
        1,
        {
          action: 'write_file',
          path: 'src/entry.js',
          content:
            "import styles from './Missing.module.css'; export default function entry() { return styles.app; }",
        },
        'fp-q1',
      );
      expect(queued).toEqual({ kind: 'continue' });
      expect(state.deferredSourceWrite?.path).toBe('src/entry.js');
      expect(state.forcedRecoveryTargetPath).toBe('src/Missing.module.css');

      // Writing the missing stylesheet stages both files
      const flushed = await executeActionStep(
        state,
        2,
        {
          action: 'write_file',
          path: 'src/Missing.module.css',
          content: '.app { display: grid; }',
        },
        'fp-q2',
      );
      expect(flushed).toEqual({ kind: 'proceed' });
      expect(state.deferredSourceWrite).toBeNull();
      expect(state.messages.at(-1)?.content).toContain('queued source file src/entry.js');

      // When deferred source fails fulfillment on flush, returns continue with css_recovery
      const lwState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        request: 'create a todo app',
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        deferredSourceWrite: {
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <main className={styles.app}><h1>Todo</h1></main>; }",
          stylesheets: ['src/App.module.css'],
        },
      });
      const recoveryFlush = await executeActionStep(
        lwState,
        3,
        {
          action: 'write_file',
          path: 'src/App.module.css',
          content: '.app { display: grid; }',
        },
        'fp-q3',
      );
      expect(recoveryFlush).toEqual({ kind: 'continue' });
      expect(lwState.messages.at(-1)?.content).toContain('css_recovery');
    });
  });

  describe('handleActionExecutionError branches', () => {
    it('handles task contract violation as continue, rethrows AgentExecutionError, and tracks declaration repair limits', async () => {
      const files = { 'src/a.js': 'export const a = 1;' };
      const scopedState = await makeState({
        files,
        scope: 'file',
        activeFile: 'src/a.js',
        request: 'update src/a.js',
        taskContract: buildTaskContract({
          request: 'update src/a.js',
          scope: 'file',
          activeFile: 'src/a.js',
          files,
        }),
      });
      const outOfScope = await executeActionStep(
        scopedState,
        1,
        { action: 'write_file', path: 'outside/b.js', content: 'export const b = 2;' },
        'fp-scope',
      );
      expect(outOfScope).toEqual({ kind: 'continue' });
      expect(scopedState.messages.at(-1)?.content).toContain(
        'Target path is outside the task contract',
      );

      scopedState.runValidation = vi.fn().mockRejectedValue(new AgentExecutionError('fatal', []));
      await expect(
        executeActionStep(scopedState, 2, { action: 'validate' }, 'fp-fatal'),
      ).rejects.toThrow(AgentExecutionError);

      const declState = await makeState({ validationRepairLimit: 2 });
      const undeclaredAction = {
        action: 'write_file' as const,
        path: 'src/App.jsx',
        content:
          'export default function App() { return <button onClick={missingHandler}>Go</button>; }',
      };
      expect(await executeActionStep(declState, 1, undeclaredAction, 'fp-decl1')).toEqual({
        kind: 'continue',
      });
      expect(declState.declarationRepairAttempts).toBe(1);

      await expect(executeActionStep(declState, 2, undeclaredAction, 'fp-decl2')).rejects.toThrow(
        /declaration repairs/,
      );
    });

    it('recovers after repeated malformed .module.css writes with and without styleProfile', async () => {
      // Without resolvedStyleProfile
      const noProfileState = await makeState({
        files: { 'src/App.jsx': 'export default function App() { return <main>App</main>; }' },
      });
      const badCss = {
        action: 'write_file' as const,
        path: 'src/App.module.css',
        content: '.app { color: red;',
      };
      expect(await executeActionStep(noProfileState, 1, badCss, 'fp-css1')).toEqual({
        kind: 'continue',
      });
      expect(noProfileState.failedStylesheetWrites.get('src/App.module.css')).toBe(1);

      expect(await executeActionStep(noProfileState, 2, badCss, 'fp-css2')).toEqual({
        kind: 'continue',
      });
      expect(noProfileState.workspace.files['src/App.module.css']).toContain('.component');
      expect(noProfileState.forcedWriteRecoveryPending).toBe(false);

      // With resolvedStyleProfile and deferredSourceWrite
      const withProfileState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        priorContext: '[list_files]\nsrc/App.jsx',
        files: { 'src/App.jsx': 'export default function App() { return <main>App</main>; }' },
        deferredSourceWrite: {
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <main className={styles.app}>App</main>; }",
          stylesheets: ['src/App.module.css'],
        },
        failedStylesheetWrites: new Map([['src/App.module.css', 1]]),
      });
      expect(await executeActionStep(withProfileState, 3, badCss, 'fp-css3')).toEqual({
        kind: 'continue',
      });
      expect(withProfileState.workspace.files['src/App.module.css']).toContain('.app');
    });

    it('handles placeholder/non-code errors and malformed source syntax errors up to limits', async () => {
      // Placeholder rejection for lightweight vs standard, then limit reached
      const placeholderState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        failedWriteAttemptLimit: 2,
      });
      const placeholderAction = {
        action: 'write_file' as const,
        path: 'src/App.jsx',
        content: '// Your implementation goes here.',
      };
      expect(await executeActionStep(placeholderState, 1, placeholderAction, 'fp-ph1')).toEqual({
        kind: 'continue',
      });
      expect(placeholderState.messages.at(-1)?.content).toContain('labelled code fence');

      await expect(
        executeActionStep(placeholderState, 2, placeholderAction, 'fp-ph2'),
      ).rejects.toThrow(AgentExecutionError);

      const stdPlaceholderState = await makeState({ failedWriteAttemptLimit: 3 });
      expect(
        await executeActionStep(stdPlaceholderState, 1, placeholderAction, 'fp-ph-std'),
      ).toEqual({ kind: 'continue' });
      expect(stdPlaceholderState.messages.at(-1)?.content).toContain(
        'Return a complete working implementation',
      );

      // Malformed JSX syntax for lightweight vs standard, then limit reached
      const malformedLw = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        malformedSourceAttemptLimit: 2,
      });
      const brokenJsx = {
        action: 'write_file' as const,
        path: 'src/App.jsx',
        content: 'export default function App() { return <main>Broken</main>;',
      };
      expect(await executeActionStep(malformedLw, 1, brokenJsx, 'fp-mal1')).toEqual({
        kind: 'continue',
      });
      expect(malformedLw.forcedWriteRecoveryPending).toBe(true);
      expect(malformedLw.messages.at(-1)?.content).toContain('Do not return JSON');

      await expect(executeActionStep(malformedLw, 2, brokenJsx, 'fp-mal2')).rejects.toThrow(
        /repeatedly produced malformed source/,
      );

      const malformedStd = await makeState({ malformedSourceAttemptLimit: 3 });
      expect(await executeActionStep(malformedStd, 1, brokenJsx, 'fp-mal-std')).toEqual({
        kind: 'continue',
      });
      expect(malformedStd.messages.at(-1)?.content).toContain(
        'The rejected source file was not staged',
      );
      expect(malformedStd.messages.at(-1)?.content).not.toContain('Do not return JSON');
    });

    it('falls back to standard missing-CSS-Module recovery when syntax fails alongside missing stylesheet', async () => {
      const state = await makeState({
        files: { 'src/entry.js': 'export default function entry() { return null; }' },
      });
      // Staged target already exists so failedWriteContent clears to ''
      state.workspace.write('src/entry.js', 'export default function entry() { return 1; }');
      const outcome = await executeActionStep(
        state,
        1,
        {
          action: 'write_file',
          path: 'src/entry.js',
          content:
            "import styles from './Missing.module.css'; export default function entry() { return styles.app;",
        },
        'fp-miss-bad',
      );
      expect(outcome).toEqual({ kind: 'continue' });
      expect(state.failedWriteContent).toBe('');
      expect(state.messages.at(-1)?.content).toContain(
        'Create the missing co-located stylesheet now',
      );
    });
  });
});
