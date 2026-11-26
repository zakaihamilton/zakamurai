import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTaskContract } from '../ReliabilityContracts';
import { AgentExecutionError } from './ActionLoopErrors';
import { createActionLoopOpening, handleActionLoopDirectReply } from './ActionLoopSession';
import { AgentContextManager } from './ContextManager';
import { ALL_AGENT_ACTIONS } from './Protocol';
import { AgentWorkspace } from './Workspace';

const baseDirectReplyParams = (
  overrides: Partial<Parameters<typeof handleActionLoopDirectReply>[0]> = {},
): Parameters<typeof handleActionLoopDirectReply>[0] => {
  const files = { 'src/App.jsx': 'export default function App() { return <main>Old</main>; }' };
  const workspace = overrides.workspace ?? new AgentWorkspace(files);
  return {
    replyText: '{"kind":"answer","summary":"Done"}',
    workspace,
    taskContract: buildTaskContract({ request: 'update the app', scope: 'project', files }),
    validate: null,
    runValidation: vi.fn().mockResolvedValue('{"status":"passed","check":"build"}'),
    turn: 1,
    directChangesRecoveryPending: false,
    forcedWriteRecoveryPending: false,
    directRepairAttempts: 0,
    activeFile: 'src/App.jsx',
    previewInspectionRequired: false,
    previewInspectState: {
      inspectedPreview: false,
      previewInspectionAccepted: false,
      lastPreviewResult: '',
    },
    inspectPreview: null,
    onEvent: vi.fn(),
    agentRole: null,
    hostAssistedSession: false,
    modularGeneration: false,
    modularOutputFailures: 0,
    request: 'update the app',
    modularTargetPath: 'src/App.jsx',
    applyCssModuleRecovery: vi.fn().mockReturnValue([]),
    autoFinishSummary: vi.fn((reason) => `auto-finished:${reason}`),
    context: new AgentContextManager({ request: 'update the app' }),
    clearFailedWriteAttempts: vi.fn(),
    messages: [],
    ...overrides,
  };
};

describe('ActionLoopSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createActionLoopOpening', () => {
    it('builds standard opening without host assistance or visual instructions', () => {
      const opening = createActionLoopOpening({
        request: 'rename variable in helper',
        scope: 'file',
        activeFile: 'src/helper.ts',
        selectedLines: [1, 2],
        files: { 'src/helper.ts': 'export const a = 1;' },
        model: 'Qwen3.5-9B-q4f16_1-MLC',
        systemPrompt: 'CUSTOM SYSTEM',
        allowedActions: ALL_AGENT_ACTIONS,
        visualMode: false,
        conversationContext: '[prior]\nhello',
      });

      expect(opening.hostAssistedSession).toBe(false);
      expect(opening.useContextReadyPrompt).toBe(false);
      expect(opening.resolvedStyleProfile).toBeUndefined();
      expect(opening.lightweightTargetPath).toBe('src/helper.ts');
      expect(opening.messages[0]).toEqual({ role: 'system', content: 'CUSTOM SYSTEM' });
      expect(opening.messages[1].content).toContain('rename variable in helper');
      expect(opening.messages[1].content).not.toContain('Visual quality is a hard requirement');
    });

    it('includes modular entry guidance and visual quality for lightweight new app generation without prior context', () => {
      const opening = createActionLoopOpening({
        request: 'create a todo app',
        files: { 'src/App.tsx': 'export default function App() { return null; }' },
        model: 'Qwen3.5-0.8B-q4f16_1-MLC',
        priorContext: '',
        systemPrompt: 'IGNORED',
        allowedActions: ALL_AGENT_ACTIONS,
        visualMode: false,
        conversationContext: '',
      });

      expect(opening.modularGeneration).toBe(true);
      expect(opening.useContextReadyPrompt).toBe(false);
      expect(opening.hostAssistedSession).toBe(true);
      expect(opening.resolvedStyleProfile).toBeDefined();
      expect(opening.lightweightTargetPath).toBe('src/App.tsx');
      expect(opening.messages[1].content).toContain(
        'Modular app entry path: src/App.tsx. Its stylesheet path is src/App.module.css.',
      );
      expect(opening.messages[1].content).toContain('Visual quality is a hard requirement');
      expect(opening.messages[1].content).toContain('All/Active/Completed filter tabs');
    });

    it('uses context-ready prompt when priorContext is supplied and adds visual instructions when visualMode is true', () => {
      const opening = createActionLoopOpening({
        request: 'update button styling',
        files: {},
        model: 'Qwen3.5-9B-q4f16_1-MLC',
        priorContext: '[list_files]\nsrc/App.jsx',
        systemPrompt: 'BASE SYSTEM',
        allowedActions: ALL_AGENT_ACTIONS,
        visualMode: true,
        conversationContext: '',
      });

      expect(opening.useContextReadyPrompt).toBe(true);
      expect(opening.lightweightTargetPath).toBe('src/App.jsx');
      expect(opening.messages[0].content).toContain('BASE SYSTEM');
      expect(opening.messages[1].content).toContain('Visual quality is a hard requirement');
      expect(opening.messages[1].content).toContain('update button styling');
    });
  });

  describe('handleActionLoopDirectReply', () => {
    it('returns unhandled for unparseable text or non-changes reply in modular generation mode', async () => {
      const plain = await handleActionLoopDirectReply(
        baseDirectReplyParams({ replyText: 'Not JSON at all' }),
      );
      expect(plain).toEqual({ kind: 'unhandled' });

      const modularNonChanges = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          modularGeneration: true,
          replyText: '{"kind":"answer","summary":"Just talking"}',
        }),
      );
      expect(modularNonChanges).toEqual({ kind: 'unhandled' });
    });

    it('handles single-file modular fallback with CSS recovery, validation, and recovery provenance', async () => {
      const applyCssModuleRecovery = vi.fn().mockReturnValue(['src/App.module.css']);
      const onEvent = vi.fn();
      const context = new AgentContextManager({ request: 'create a counter app' });
      const clearFailedWriteAttempts = vi.fn();
      const runValidation = vi.fn().mockResolvedValue('{"status":"passed","check":"build"}');

      const outcome = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          modularGeneration: true,
          hostAssistedSession: true,
          directChangesRecoveryPending: true,
          request: 'create a counter app',
          modularTargetPath: 'src/App.jsx',
          validate: vi.fn(),
          runValidation,
          applyCssModuleRecovery,
          clearFailedWriteAttempts,
          onEvent,
          context,
          replyText: JSON.stringify({
            kind: 'changes',
            changes: [
              {
                path: 'src/App.jsx',
                content: 'export default function App() { return <main>Counter</main>; }',
              },
            ],
          }),
        }),
      );

      expect(outcome.kind).toBe('handled');
      if (outcome.kind === 'handled') {
        expect(outcome.result?.summary).toBe('Prepared 1 file(s) for review.');
      }
      expect(clearFailedWriteAttempts).toHaveBeenCalledTimes(1);
      expect(applyCssModuleRecovery).toHaveBeenCalledWith(1);
      expect(runValidation).toHaveBeenCalledWith(1, 'recovery');
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'observation', turn: 1 }),
      );
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'finished', provenance: 'recovery' }),
      );
      expect(context.toString()).toContain('modular_generation_single_file_fallback');
    });

    it('retries and then throws when modular generation omits required files', async () => {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      const replyText = JSON.stringify({
        kind: 'changes',
        summary: 'Incomplete modular bundle',
        changes: [
          { path: 'src/App.jsx', content: 'export default function App() { return <main />; }' },
          { path: 'src/App.css', content: 'body {}' },
        ],
      });

      const first = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          modularGeneration: true,
          modularOutputFailures: 0,
          request: 'create a todo app',
          replyText,
          messages,
        }),
      );
      expect(first).toEqual({ kind: 'handled', modularOutputFailures: 1 });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('does not meet modular app requirements');

      await expect(
        handleActionLoopDirectReply(
          baseDirectReplyParams({
            modularGeneration: true,
            modularOutputFailures: 1,
            request: 'create a todo app',
            replyText,
          }),
        ),
      ).rejects.toThrow(AgentExecutionError);
    });

    it('rejects out-of-contract or invalid changes in both non-modular and modular modes', async () => {
      const files = { 'src/a.js': 'export const a = 1;' };
      const workspace = new AgentWorkspace(files);
      const taskContract = buildTaskContract({
        request: 'update src/a.js',
        scope: 'file',
        activeFile: 'src/a.js',
        files,
      });
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      const outOfScope = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          workspace,
          taskContract,
          messages,
          replyText: JSON.stringify({
            kind: 'changes',
            summary: 'Wrong file',
            changes: [{ path: 'outside/other.js', content: 'export const b = 2;' }],
          }),
        }),
      );
      expect(outOfScope).toEqual({ kind: 'handled' });
      expect(messages[0].content).toContain('Target path is outside the task contract');

      const modularBadBundle = JSON.stringify({
        kind: 'changes',
        summary: 'Invalid bundle',
        changes: [
          {
            path: 'src/App.jsx',
            content: "import './App.module.css'; export default () => <div />;",
          },
          { path: 'src/App.module.css', content: '.app { color: red; }' },
          {
            path: 'src/components/Widget.jsx',
            content:
              "import styles from './Widget.module.css'; export default () => <div className={styles.box}>// TODO</div>;",
          },
          { path: 'src/components/Widget.module.css', content: '.box { color: blue; }' },
        ],
      });
      // Inject invalid path traversal inside accepted/rejected validation path for modular retry & throw
      const badTraversalBundle = JSON.stringify({
        kind: 'changes',
        summary: 'Bad modular bundle',
        changes: [
          {
            path: 'src/App.jsx',
            content:
              "import styles from './App.module.css'; import Widget from './components/Widget'; export default function App() { return <main className={styles.app}><Widget /></main>; }",
          },
          { path: 'src/App.module.css', content: '.app { display: block; }' },
          {
            path: 'src/components/Widget.jsx',
            content:
              "import styles from './Widget.module.css'; export default function Widget() { return <div className={styles.box}>Ok</div>; }",
          },
          { path: 'src/components/Widget.module.css', content: '.box { color: red; }' },
          { path: '../escape.js', content: 'bad' },
        ],
      });

      const modRetry = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          modularGeneration: true,
          modularOutputFailures: 0,
          request: 'create a dashboard app',
          replyText: badTraversalBundle,
          messages: [],
        }),
      );
      expect(modRetry).toEqual({ kind: 'handled', modularOutputFailures: 1 });

      await expect(
        handleActionLoopDirectReply(
          baseDirectReplyParams({
            modularGeneration: true,
            modularOutputFailures: 1,
            request: 'create a dashboard app',
            replyText: badTraversalBundle,
          }),
        ),
      ).rejects.toThrow(/repeatedly returned invalid modular files/);

      expect(modularBadBundle).toBeTruthy();
    });

    it('handles deletions and validation failures with repair, modular retry, and max repair error', async () => {
      const files = {
        'src/App.jsx': 'export default function App() { return <main>App</main>; }',
        'src/old.js': 'export const old = 1;',
      };
      const workspace = new AgentWorkspace(files);
      const runValidation = vi
        .fn()
        .mockResolvedValue('{"status":"failed","check":"build","diagnostics":"Broken"}');
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      const deleteRepair = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          workspace,
          taskContract: buildTaskContract({
            request: 'delete old and fix',
            scope: 'project',
            files,
          }),
          validate: vi.fn(),
          runValidation,
          directRepairAttempts: 0,
          messages,
          replyText: JSON.stringify({
            kind: 'changes',
            summary: 'Delete old file',
            changes: [{ path: 'src/old.js', delete: true }],
          }),
        }),
      );
      expect(workspace.files['src/old.js']).toBeUndefined();
      expect(deleteRepair).toEqual({
        kind: 'repair',
        failedWritePath: 'src/App.jsx',
        failedWriteContent: 'export default function App() { return <main>App</main>; }',
        failedWriteDiagnostic: '{"status":"failed","check":"build","diagnostics":"Broken"}',
        directRepairAttempts: 1,
      });

      const modularValidationRetry = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          workspace: new AgentWorkspace(files),
          taskContract: buildTaskContract({
            request: 'create a widget app',
            scope: 'project',
            files,
          }),
          modularGeneration: true,
          request: 'create a widget app',
          validate: vi.fn(),
          runValidation,
          directRepairAttempts: 1,
          messages: [],
          replyText: JSON.stringify({
            kind: 'changes',
            summary: 'Bundle',
            changes: [
              {
                path: 'src/App.jsx',
                content:
                  "import styles from './App.module.css'; import Widget from './components/Widget'; export default function App() { return <main className={styles.app}><Widget /></main>; }",
              },
              { path: 'src/App.module.css', content: '.app { display: block; }' },
              {
                path: 'src/components/Widget.jsx',
                content:
                  "import styles from './Widget.module.css'; export default function Widget() { return <div className={styles.box}>Hi</div>; }",
              },
              { path: 'src/components/Widget.module.css', content: '.box { color: red; }' },
            ],
          }),
        }),
      );
      expect(modularValidationRetry).toEqual({ kind: 'handled', directRepairAttempts: 2 });

      await expect(
        handleActionLoopDirectReply(
          baseDirectReplyParams({
            validate: vi.fn(),
            runValidation,
            directRepairAttempts: 2,
            replyText: JSON.stringify({
              kind: 'changes',
              changes: [{ path: 'src/App.jsx', content: 'export default () => <div />;' }],
            }),
          }),
        ),
      ).rejects.toThrow(AgentExecutionError);
    });

    it('inspects preview when required: fails on missing evidence/unavailable and appends summary on pass', async () => {
      const replyText = JSON.stringify({
        kind: 'changes',
        summary: 'Updated UI',
        changes: [{ path: 'src/App.jsx', content: 'export default () => <main>UI</main>;' }],
      });

      // Missing inspectPreview function
      const unavailableState = {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      };
      const unavailableMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
        [];
      const unavailableOutcome = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          previewInspectionRequired: true,
          previewInspectState: unavailableState,
          inspectPreview: null,
          messages: unavailableMessages,
          replyText,
        }),
      );
      expect(unavailableOutcome).toEqual({ kind: 'handled' });
      expect(unavailableState.inspectedPreview).toBe(true);
      expect(unavailableState.previewInspectionAccepted).toBe(false);
      expect(unavailableMessages[0].content).toContain('Preview inspection is unavailable');

      // inspectPreview fails visual check
      const failState = {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      };
      const failOutcome = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          previewInspectionRequired: true,
          previewInspectState: failState,
          inspectPreview: vi.fn().mockResolvedValue({
            elements: ['main: app'],
            screenshotCaptured: false,
          }),
          replyText,
        }),
      );
      expect(failOutcome).toEqual({ kind: 'handled' });
      expect(failState.previewInspectionAccepted).toBe(false);

      // inspectPreview passes visual check
      const passState = {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      };
      const passOutcome = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          previewInspectionRequired: true,
          previewInspectState: passState,
          inspectPreview: vi.fn().mockResolvedValue({
            elements: ['main: app', 'button: Save'],
            screenshotCaptured: true,
          }),
          replyText,
        }),
      );
      expect(passState.previewInspectionAccepted).toBe(true);
      expect(passOutcome.kind).toBe('handled');
      if (passOutcome.kind === 'handled') {
        expect(passOutcome.result?.summary).toContain('Updated UI\n\nPreview inspection:');
      }
    });

    it('handles answer replies: auto-finishes host-assisted staged changes on pass and falls back on failure', async () => {
      const files = { 'src/App.jsx': 'export default function App() { return <main>Old</main>; }' };
      const workspace = new AgentWorkspace(files);
      workspace.write('src/App.jsx', 'export default function App() { return <main>New</main>; }');
      const context = new AgentContextManager({ request: 'update app' });

      const autoFinished = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          workspace,
          hostAssistedSession: true,
          validate: vi.fn(),
          runValidation: vi.fn().mockResolvedValue('{"status":"passed","check":"build"}'),
          context,
          replyText: '{"kind":"answer","summary":"Done"}',
        }),
      );
      expect(autoFinished.kind).toBe('handled');
      if (autoFinished.kind === 'handled') {
        expect(autoFinished.result?.summary).toBe('auto-finished:validate');
      }
      expect(context.toString()).toContain('[validation]');

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      const failedAnswer = await handleActionLoopDirectReply(
        baseDirectReplyParams({
          workspace,
          hostAssistedSession: true,
          validate: vi.fn(),
          runValidation: vi.fn().mockRejectedValue(new Error('boom')),
          messages,
          replyText: '{"kind":"answer","summary":"Done"}',
        }),
      );
      expect(failedAnswer).toEqual({ kind: 'handled' });
      expect(messages[0].content).toContain('did not return any changes for an edit request');
    });
  });
});
