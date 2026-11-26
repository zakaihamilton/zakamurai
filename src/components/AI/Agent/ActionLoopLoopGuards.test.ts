import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentExecutionError, AgentRecoveryValidationError } from './ActionLoopErrors';
import { runActionLoopGuards } from './ActionLoopLoopGuards';
import { type ActionLoopState, createActionLoopState } from './ActionLoopState';

const makeState = async (
  overrides: Partial<ActionLoopState> & {
    files?: Record<string, string>;
    request?: string;
    model?: string;
    priorContext?: string;
    activeFile?: string | null;
    validate?: (files: Record<string, string>) => Promise<unknown> | unknown;
    inspectPreview?: (files: Record<string, string>) => Promise<unknown>;
    requirePreviewInspection?: boolean;
  } = {},
): Promise<ActionLoopState> => {
  const {
    files = { 'src/App.jsx': 'export default function App() { return <main>App</main>; }' },
    request = 'create a counter app',
    model = 'Qwen3.5-9B-q4f16_1-MLC',
    priorContext = '',
    activeFile = 'src/App.jsx',
    validate,
    inspectPreview,
    requirePreviewInspection,
    ...rest
  } = overrides;
  const state = await createActionLoopState({
    request,
    files,
    model,
    priorContext,
    activeFile,
    validate,
    inspectPreview,
    requirePreviewInspection,
    modelClient: vi.fn(),
    onEvent: vi.fn(),
  });
  Object.assign(state, rest);
  return state;
};

describe('ActionLoopLoopGuards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleForcedWriteViolation', () => {
    it('proceeds when forced write recovery is inactive or action is write_file', async () => {
      const state = await makeState({ forcedWriteRecoveryPending: false });
      expect(await runActionLoopGuards(state, 1, { action: 'list_files' }, 'fp1')).toEqual({
        kind: 'proceed',
      });

      state.forcedWriteRecoveryPending = true;
      expect(
        await runActionLoopGuards(
          state,
          1,
          { action: 'write_file', path: 'src/App.jsx', content: 'x' },
          'fp2',
        ),
      ).toEqual({ kind: 'proceed' });
    });

    it('activates direct_recovery on first violation with no staged changes for both lightweight and standard models', async () => {
      const lwState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        forcedWriteRecoveryPending: true,
        forcedRecoveryTargetPath: 'src/App.jsx',
      });
      const lwOutcome = await runActionLoopGuards(
        lwState,
        1,
        { action: 'read_file', path: 'src/App.jsx' },
        'fp1',
      );
      expect(lwOutcome).toEqual({ kind: 'continue' });
      expect(lwState.directChangesRecoveryPending).toBe(true);
      expect(lwState.messages.at(-1)?.content).toContain('Fence-only recovery is active');
      expect(lwState.messages.at(-1)?.content).toContain('for src/App.jsx');

      const stdState = await makeState({
        files: {},
        activeFile: null,
        request: 'inspect workspace',
        forcedWriteRecoveryPending: true,
        forcedRecoveryTargetPath: null,
      });
      const stdOutcome = await runActionLoopGuards(stdState, 1, { action: 'list_files' }, 'fp2');
      expect(stdOutcome).toEqual({ kind: 'continue' });
      expect(stdState.messages.at(-1)?.content).toContain('Direct recovery is active');
      expect(stdState.messages.at(-1)?.content).not.toContain('for src/');
    });

    it('emits stuck_read_recovery on first violation when staged changes already exist', async () => {
      const lwState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        forcedWriteRecoveryPending: true,
        forcedRecoveryTargetPath: 'src/App.jsx',
      });
      lwState.workspace.write('src/App.jsx', 'export default () => <main>Edited</main>;');
      const lwOutcome = await runActionLoopGuards(lwState, 1, { action: 'list_files' }, 'fp1');
      expect(lwOutcome).toEqual({ kind: 'continue' });
      expect(lwState.messages.at(-1)?.content).toContain('Reply with ONLY a labelled code fence');

      const stdState = await makeState({
        files: {},
        activeFile: null,
        forcedWriteRecoveryPending: true,
        forcedRecoveryTargetPath: null,
      });
      stdState.workspace.write('src/New.jsx', 'export default () => <div />;');
      const stdOutcome = await runActionLoopGuards(stdState, 1, { action: 'list_files' }, 'fp2');
      expect(stdOutcome).toEqual({ kind: 'continue' });
      expect(stdState.messages.at(-1)?.content).toContain(
        'Your next response must be a write_file action',
      );
    });

    it('validates staged changes or throws AgentRecoveryValidationError on violation >= 2', async () => {
      const passingState = await makeState({
        forcedWriteRecoveryPending: true,
        forcedWriteRecoveryViolations: 1,
        files: {
          'src/App.jsx':
            'export default function App() { return <><h1>New Project</h1><p>Start coding here...</p></>; }',
        },
      });
      passingState.workspace.write(
        'src/components/Counter.jsx',
        'export default function Counter() { return <button>1</button>; }',
      );
      passingState.runValidation = vi.fn().mockResolvedValue('{"status":"passed"}');
      const okOutcome = await runActionLoopGuards(passingState, 3, { action: 'list_files' }, 'fp1');
      expect(okOutcome.kind).toBe('return');
      if (okOutcome.kind === 'return') {
        expect(okOutcome.result.summary).toContain('wired src/App.jsx');
      }

      const failingState = await makeState({
        forcedWriteRecoveryPending: true,
        forcedWriteRecoveryViolations: 1,
      });
      failingState.workspace.write('src/App.jsx', 'export default () => <main>Broken</main>;');
      failingState.runValidation = vi.fn().mockResolvedValue('{"status":"failed"}');
      await expect(
        runActionLoopGuards(failingState, 3, { action: 'list_files' }, 'fp2'),
      ).rejects.toThrow(AgentRecoveryValidationError);
    });

    it('triggers direct_recovery then throws AgentExecutionError on violation >= 2 with no changes', async () => {
      const state = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        forcedWriteRecoveryPending: true,
        forcedWriteRecoveryViolations: 1,
        directChangesRecoveryPending: false,
        files: {},
        activeFile: null,
      });
      const first = await runActionLoopGuards(state, 2, { action: 'list_files' }, 'fp1');
      expect(first).toEqual({ kind: 'continue' });
      expect(state.directChangesRecoveryPending).toBe(true);

      await expect(runActionLoopGuards(state, 3, { action: 'list_files' }, 'fp2')).rejects.toThrow(
        AgentExecutionError,
      );
    });
  });

  describe('flushDeferredSourceWrite', () => {
    it('proceeds when the model writes the requested stylesheet and flushes otherwise', async () => {
      const state = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        request: 'update button',
        deferredSourceWrite: {
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <button className={styles.btn}>Go</button>; }",
          stylesheets: ['src/App.module.css'],
        },
      });
      expect(
        await runActionLoopGuards(
          state,
          1,
          { action: 'write_file', path: 'src/App.module.css', content: '.btn {}' },
          'fp1',
        ),
      ).toEqual({ kind: 'proceed' });

      // Non-stylesheet action triggers hostAssistedSession + finish -> proceed
      const outcomeFinish = await runActionLoopGuards(
        state,
        2,
        { action: 'finish', summary: 'done' },
        'fp2',
      );
      expect(outcomeFinish).toEqual({ kind: 'proceed' });
      expect(state.deferredSourceWrite).toBeNull();
      expect(state.workspace.files['src/App.module.css']).toContain('.btn');
    });

    it('returns continue on non-finish flush or when stageDeferredRecovery rejects incomplete source', async () => {
      const stdState = await makeState({
        request: 'update text',
        deferredSourceWrite: {
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <main className={styles.app}>Updated</main>; }",
          stylesheets: ['src/App.module.css'],
        },
      });
      expect(await runActionLoopGuards(stdState, 1, { action: 'list_files' }, 'fp1')).toEqual({
        kind: 'continue',
      });
      expect(stdState.messages.at(-1)?.content).toContain('generated semantic CSS recovery');

      const rejectedState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        request: 'create a todo app',
        deferredSourceWrite: {
          path: 'src/App.jsx',
          content:
            "import styles from './App.module.css'; export default function App() { return <main className={styles.app}><h1>Todo</h1></main>; }",
          stylesheets: ['src/App.module.css'],
        },
      });
      const rejectedOutcome = await runActionLoopGuards(
        rejectedState,
        1,
        { action: 'finish' },
        'fp2',
      );
      expect(rejectedOutcome).toEqual({ kind: 'continue' });
      expect(rejectedState.forcedWriteRecoveryPending).toBe(true);
      expect(rejectedState.messages.at(-1)?.content).toContain('css_recovery');
    });
  });

  describe('checkStuckReadAndNonProductive', () => {
    it('forces write recovery after reaching nonProductiveActionLimit', async () => {
      const state = await makeState({
        request: 'update src/App.jsx',
        nonProductiveActionLimit: 2,
      });
      expect(await runActionLoopGuards(state, 1, { action: 'list_files' }, 'fp1')).toEqual({
        kind: 'proceed',
      });
      const second = await runActionLoopGuards(
        state,
        2,
        { action: 'search_workspace', query: 'App' },
        'fp2',
      );
      expect(second).toEqual({ kind: 'continue' });
      expect(state.forcedWriteRecoveryPending).toBe(true);
      expect(state.messages.at(-1)?.content).toContain('stuck_read_recovery');
    });

    it('skips duplicate unchanged reads and stops or auto-finishes on repeated unchanged reads', async () => {
      const noChangesState = await makeState({ request: 'explain app' });
      noChangesState.lastReadContents.set(
        'src/App.jsx',
        noChangesState.workspace.files['src/App.jsx'],
      );

      const first = await runActionLoopGuards(
        noChangesState,
        1,
        { action: 'read_file', path: 'src/App.jsx' },
        'fp1',
      );
      expect(first).toEqual({ kind: 'continue' });
      expect(noChangesState.forcedWriteRecoveryPending).toBe(true);

      noChangesState.forcedWriteRecoveryPending = false;
      await expect(
        runActionLoopGuards(noChangesState, 2, { action: 'read_file', path: 'src/App.jsx' }, 'fp2'),
      ).rejects.toThrow(AgentExecutionError);

      // With staged changes: skip 1 returns continue; skip 2 validates and returns or throws
      const withChanges = await makeState({ request: 'explain app' });
      withChanges.workspace.write('src/App.jsx', 'export default () => <main>Updated</main>;');
      withChanges.lastReadContents.set('src/App.jsx', withChanges.workspace.files['src/App.jsx']);
      expect(
        await runActionLoopGuards(
          withChanges,
          1,
          { action: 'read_file', path: 'src/App.jsx' },
          'fp1',
        ),
      ).toEqual({ kind: 'continue' });

      withChanges.runValidation = vi.fn().mockResolvedValue('{"status":"passed"}');
      const finished = await runActionLoopGuards(
        withChanges,
        2,
        { action: 'read_file', path: 'src/App.jsx' },
        'fp2',
      );
      expect(finished.kind).toBe('return');

      const failingChanges = await makeState({ request: 'explain app', unchangedReadSkips: 1 });
      failingChanges.workspace.write('src/App.jsx', 'export default () => <main>Bad</main>;');
      failingChanges.lastReadContents.set(
        'src/App.jsx',
        failingChanges.workspace.files['src/App.jsx'],
      );
      failingChanges.runValidation = vi.fn().mockResolvedValue('{"status":"failed"}');
      await expect(
        runActionLoopGuards(failingChanges, 3, { action: 'read_file', path: 'src/App.jsx' }, 'fp3'),
      ).rejects.toThrow(AgentRecoveryValidationError);
    });
  });

  describe('handleRepeatedActionGuards', () => {
    it('auto-finishes when fingerprint matches recoveredNoOpWrite and clears it otherwise', async () => {
      const matchState = await makeState({ recoveredNoOpWrite: 'fp-noop' });
      matchState.workspace.write('src/App.jsx', 'export default () => <main>Ok</main>;');
      const res = await runActionLoopGuards(matchState, 2, { action: 'finish' }, 'fp-noop');
      expect(res.kind).toBe('return');

      const missState = await makeState({ recoveredNoOpWrite: 'fp-noop' });
      expect(await runActionLoopGuards(missState, 2, { action: 'list_files' }, 'fp-other')).toEqual(
        {
          kind: 'proceed',
        },
      );
      expect(missState.recoveredNoOpWrite).toBe('');
    });

    it('handles repeated validate with preview inspection gate, failed validation, and pass finish', async () => {
      // Preview inspection blocks auto-finish when preview is not accepted
      const previewFailState = await makeState({
        finishAfterAutomaticValidation: true,
        previewInspectionRequired: true,
      });
      previewFailState.workspace.write('src/App.jsx', 'export default () => <main>App</main>;');
      previewFailState.inspectPreviewForLoop = vi.fn().mockResolvedValue('{"status":"failed"}');
      const blocked = await runActionLoopGuards(
        previewFailState,
        2,
        { action: 'validate' },
        'fp-val',
      );
      expect(blocked).toEqual({ kind: 'continue' });
      expect(previewFailState.finishAfterAutomaticValidation).toBe(false);
      expect(previewFailState.messages.at(-1)?.content).toContain('preview is not ready');

      // Repeated validate fails validation -> recovery observation
      const valFailState = await makeState({ lastFingerprint: 'fp-val', repeatedActions: 0 });
      valFailState.workspace.write('src/App.jsx', 'export default () => <main>Bad</main>;');
      valFailState.runValidation = vi
        .fn()
        .mockResolvedValue('{"status":"failed","diagnostics":"err"}');
      const failedOutcome = await runActionLoopGuards(
        valFailState,
        2,
        { action: 'validate' },
        'fp-val',
      );
      expect(failedOutcome).toEqual({ kind: 'continue' });
      expect(valFailState.forcedWriteRecoveryPending).toBe(true);
      expect(valFailState.failedWriteDiagnostic).toContain('failed');

      // Repeated validate passes after automatic validation + accepted preview
      const valPassState = await makeState({
        finishAfterAutomaticValidation: true,
        automaticValidationResult: '{"status":"passed"}',
        previewInspectionRequired: true,
      });
      valPassState.workspace.write('src/App.jsx', 'export default () => <main>Good</main>;');
      valPassState.inspectPreviewForLoop = vi.fn(async () => {
        valPassState.previewInspectState.inspectedPreview = true;
        valPassState.previewInspectState.previewInspectionAccepted = true;
        return '{"elements":["main: app"],"screenshotCaptured":true}';
      });
      const passedOutcome = await runActionLoopGuards(
        valPassState,
        3,
        { action: 'validate' },
        'fp-val',
      );
      expect(passedOutcome.kind).toBe('return');
    });

    it('handles repeated saved writes for host-assisted, standard, failed validation, and thrown validation errors', async () => {
      const content = 'export default () => <main>Same</main>;';
      const writeAction = { action: 'write_file' as const, path: 'src/App.jsx', content };

      // Standard model passing validation sets recoveredNoOpWrite + finishAfterAutomaticValidation
      const stdState = await makeState({
        files: { 'src/App.jsx': content },
        lastFingerprint: 'fp-w',
        repeatedActions: 0,
      });
      stdState.runValidation = vi.fn().mockResolvedValue('{"status":"passed","check":"build"}');
      const stdRes = await runActionLoopGuards(stdState, 2, writeAction, 'fp-w');
      expect(stdRes).toEqual({ kind: 'continue' });
      expect(stdState.recoveredNoOpWrite).toBe('fp-w');
      expect(stdState.finishAfterAutomaticValidation).toBe(true);

      // Host-assisted session auto-finishes immediately on repeated identical write
      const hostState = await makeState({
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        files: { 'src/App.jsx': content },
        lastFingerprint: 'fp-w',
        repeatedActions: 0,
      });
      hostState.runValidation = vi.fn().mockResolvedValue('{"status":"passed"}');
      const hostRes = await runActionLoopGuards(hostState, 2, writeAction, 'fp-w');
      expect(hostRes.kind).toBe('return');

      // Validation failed sets forced recovery
      const failState = await makeState({
        files: { 'src/App.jsx': content },
        lastFingerprint: 'fp-w',
        repeatedActions: 0,
      });
      failState.runValidation = vi
        .fn()
        .mockResolvedValue('{"status":"failed","diagnostics":"bad"}');
      const failRes = await runActionLoopGuards(failState, 2, writeAction, 'fp-w');
      expect(failRes).toEqual({ kind: 'continue' });
      expect(failState.forcedWriteRecoveryPending).toBe(true);

      // Validation throws generic Error -> caught as continue; throws AgentExecutionError -> rethrown
      const errState = await makeState({
        files: { 'src/App.jsx': content },
        lastFingerprint: 'fp-w',
        repeatedActions: 0,
      });
      errState.runValidation = vi.fn().mockRejectedValue(new Error('runner crashed'));
      expect(await runActionLoopGuards(errState, 2, writeAction, 'fp-w')).toEqual({
        kind: 'continue',
      });
      expect(errState.messages.at(-1)?.content).toContain('runner crashed');

      errState.lastFingerprint = 'fp-w';
      errState.repeatedActions = 0;
      errState.runValidation = vi.fn().mockRejectedValue(new AgentExecutionError('fatal', []));
      await expect(runActionLoopGuards(errState, 3, writeAction, 'fp-w')).rejects.toThrow(
        AgentExecutionError,
      );
    });

    it('handles repeated non-write actions at count 2 (read-only skip vs generic) and throws at count >= 3', async () => {
      const readOnlyState = await makeState({
        request: 'explain code',
        lastFingerprint: 'fp-list',
        lastSuccessfulFingerprint: 'fp-list',
        repeatedActions: 1,
      });
      const skipRes = await runActionLoopGuards(
        readOnlyState,
        3,
        { action: 'list_files' },
        'fp-list',
      );
      expect(skipRes).toEqual({ kind: 'continue' });
      expect(readOnlyState.messages.at(-1)?.content).toContain('Duplicate list_files skipped');

      // 4th identical call (repeatedActions becomes 3) throws AgentExecutionError
      await expect(
        runActionLoopGuards(readOnlyState, 4, { action: 'list_files' }, 'fp-list'),
      ).rejects.toThrow(AgentExecutionError);

      const nonReadOnlyState = await makeState({
        request: 'explain code',
        lastFingerprint: 'fp-check',
        repeatedActions: 1,
      });
      const warnRes = await runActionLoopGuards(
        nonReadOnlyState,
        3,
        { action: 'run_project_check', check: 'test' },
        'fp-check',
      );
      expect(warnRes).toEqual({ kind: 'continue' });
      expect(nonReadOnlyState.messages.at(-1)?.content).toContain('three times in a row');
    });
  });
});
