import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerRunError, type ManagerTrace } from '@/components/AI/Agent/ManagerTrace';
import { RECOMMENDED_WEB_LLM_MODEL } from '@/components/AI/WebLLMModels';
import { PREVIEW_MESSAGE_TYPES } from '@/components/App/Views/PreviewArea/previewSandbox';
import { DEFAULT_CONTENTS } from '@/components/Storage/InitialData';
import { setMockNavigator } from '@/test-utils/domMocks';

const runManagerMock = vi.fn();
const loadManagerModelMock = vi.fn();
const unloadAllWebLLMEnginesMock = vi.fn();
const clearPreviewEvidenceMock = vi.fn();
const reportPreviewEvidenceMock = vi.fn();
const reportPreviewRuntimeErrorMock = vi.fn();
const waitForPreviewEvidenceMock = vi.fn();
const getPreviewOriginsMock = vi.fn();
const buildPreviewUrlMock = vi.fn();
const isTrustedPreviewMessageMock = vi.fn();
const parsePreviewMessageMock = vi.fn();

const compilerCompileMock = vi.fn();
const compilerGetContainerMock = vi.fn();
const compilerResetMock = vi.fn();

vi.mock('@/components/AI/Agent', () => ({
  runManager: (...args: unknown[]) => runManagerMock(...args),
}));

vi.mock('@/components/AI/Agent/ManagerModelClient', () => ({
  loadManagerModel: (...args: unknown[]) => loadManagerModelMock(...args),
}));

vi.mock('@/components/AI/WebLLMAPI', () => ({
  unloadAllWebLLMEngines: (...args: unknown[]) => unloadAllWebLLMEnginesMock(...args),
}));

vi.mock('@/components/App/Views/PreviewArea/PreviewBridge', () => ({
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="preview-bridge" data-session={sessionId} />
  ),
}));

vi.mock('@/components/App/Views/PreviewArea/previewEvidenceBridge', () => ({
  clearPreviewEvidence: (...args: unknown[]) => clearPreviewEvidenceMock(...args),
  reportPreviewEvidence: (...args: unknown[]) => reportPreviewEvidenceMock(...args),
  reportPreviewRuntimeError: (...args: unknown[]) => reportPreviewRuntimeErrorMock(...args),
  waitForPreviewEvidence: (...args: unknown[]) => waitForPreviewEvidenceMock(...args),
}));

vi.mock('@/components/App/Views/PreviewArea/previewOrigins', () => ({
  getPreviewOrigins: (...args: unknown[]) => getPreviewOriginsMock(...args),
  buildPreviewUrl: (...args: unknown[]) => buildPreviewUrlMock(...args),
}));

vi.mock('@/components/App/Views/PreviewArea/previewSandbox', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/App/Views/PreviewArea/previewSandbox')>();
  return {
    ...actual,
    isTrustedPreviewMessage: (...args: unknown[]) => isTrustedPreviewMessageMock(...args),
    parsePreviewMessage: (...args: unknown[]) => parsePreviewMessageMock(...args),
  };
});

vi.mock('@/utils/compiler', () => {
  const CompilerMock = vi.fn(function (
    this: { compile: (...args: unknown[]) => Promise<void> },
    onLog?: (line: string) => void,
  ) {
    this.compile = async (...args: unknown[]) => compilerCompileMock(onLog, ...args);
  }) as unknown as {
    new (onLog?: (line: string) => void): { compile: (...args: unknown[]) => Promise<void> };
    getContainer: () => unknown;
    reset: () => Promise<void>;
  };
  CompilerMock.getContainer = () => compilerGetContainerMock();
  CompilerMock.reset = () => compilerResetMock();
  return { Compiler: CompilerMock };
});

import LocalAIBenchmarkRunner from './runner';

function makeTrace(outcome: ManagerTrace['outcome'] = 'success'): ManagerTrace {
  return {
    version: 1,
    runId: 'run-1',
    request: 'todo',
    startedAt: 1,
    outcome,
    events: [],
  };
}

function getRenderedReport() {
  const el = document.getElementById('ai-bench-result');
  if (!el) throw new Error('missing #ai-bench-result');
  return {
    statusAttr: el.getAttribute('data-status'),
    report: JSON.parse(el.textContent || '{}'),
  };
}

function setGpuMock(
  gpu:
    | {
        requestAdapter: () => Promise<{ features?: { has: (f: string) => boolean } } | null>;
      }
    | undefined,
  baseNavigator: Navigator,
) {
  setMockNavigator({
    ...baseNavigator,
    gpu,
  } as Navigator);
}

describe('LocalAIBenchmarkRunner', () => {
  let originalNavigator: Navigator;
  let originalWorker: typeof Worker;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNavigator = globalThis.navigator;
    originalWorker = globalThis.Worker;
    window.history.replaceState({}, '', '/ai-bench-local');

    setGpuMock(
      {
        requestAdapter: async () => ({
          features: { has: (f: string) => f === 'shader-f16' },
        }),
      },
      originalNavigator,
    );

    loadManagerModelMock.mockResolvedValue(vi.fn(async () => ({ text: 'ok', metrics: {} })));
    unloadAllWebLLMEnginesMock.mockResolvedValue(undefined);
    compilerResetMock.mockResolvedValue(undefined);
    compilerCompileMock.mockImplementation(async (onLog?: (line: string) => void) => {
      onLog?.('compiled ok');
    });
    compilerGetContainerMock.mockReturnValue({
      vfs: { existsSync: (path: string) => path === '/dist/index.html' },
    });
    getPreviewOriginsMock.mockReturnValue({
      ideOrigin: 'http://localhost:3000',
      previewOrigin: 'http://localhost:3001',
      isIsolated: true,
    });
    buildPreviewUrlMock.mockImplementation(
      (_origins: unknown, sessionId: string) => `http://localhost:3001/?session=${sessionId}`,
    );
    clearPreviewEvidenceMock.mockReturnValue(1);
    waitForPreviewEvidenceMock.mockResolvedValue({
      text: 'Todo App heading',
      elements: ['h1: Todo'],
      runtimeErrors: [],
      screenshotCaptured: true,
    });
  });

  afterEach(() => {
    setMockNavigator(originalNavigator);
    globalThis.Worker = originalWorker;
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('reports error for unknown model or unknown case query parameters', async () => {
    window.history.replaceState({}, '', '/ai-bench-local?model=not-a-model');
    const { unmount } = render(<LocalAIBenchmarkRunner />);

    await waitFor(() => {
      expect(getRenderedReport().statusAttr).toBe('error');
    });
    expect(getRenderedReport().report.setupError).toContain('Unknown local model: not-a-model');
    unmount();

    window.history.replaceState({}, '', '/ai-bench-local?case=nonexistent');
    render(<LocalAIBenchmarkRunner />);
    await waitFor(() => {
      expect(getRenderedReport().statusAttr).toBe('error');
    });
    expect(getRenderedReport().report.setupError).toContain("Unknown benchmark case 'nonexistent'");
  });

  it('reports setup errors for missing WebGPU, missing/throwing adapter, missing shader-f16, and missing Worker', async () => {
    window.history.replaceState({}, '', '/ai-bench-local?case=todo');

    // 1. No navigator.gpu
    setGpuMock(undefined, originalNavigator);
    const first = render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toContain('WebGPU is unavailable');
    first.unmount();

    // 2. requestAdapter returns null
    setGpuMock({ requestAdapter: async () => null }, originalNavigator);
    const second = render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toContain('compatible adapter');
    second.unmount();

    // 3. requestAdapter throws
    setGpuMock(
      {
        requestAdapter: async () => {
          throw new Error('gpu crashed');
        },
      },
      originalNavigator,
    );
    const third = render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toContain('compatible adapter');
    third.unmount();

    // 4. Missing shader-f16
    setGpuMock(
      {
        requestAdapter: async () => ({ features: { has: () => false } }),
      },
      originalNavigator,
    );
    const fourth = render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toContain('shader-f16');
    fourth.unmount();

    // 5. Missing Worker
    setGpuMock(
      {
        requestAdapter: async () => ({ features: { has: () => true } }),
      },
      originalNavigator,
    );
    globalThis.Worker = undefined as unknown as typeof Worker;
    render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toContain('Web Workers are unavailable');
  });

  it('reports error when preview origins cannot be resolved', async () => {
    window.history.replaceState({}, '', '/ai-bench-local?case=todo');
    getPreviewOriginsMock.mockReturnValue({
      ideOrigin: null,
      previewOrigin: null,
      isIsolated: false,
    });

    render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toBe(
      'The local preview origins could not be resolved.',
    );
  });

  it('runs a passing case end-to-end, forwards model/preview callbacks, and handles trusted/untrusted preview messages', async () => {
    window.history.replaceState(
      {},
      '',
      `/ai-bench-local?case=todo&model=${encodeURIComponent(RECOMMENDED_WEB_LLM_MODEL.id)}`,
    );

    const updatedAppJsx = [
      'export default function App() {',
      '  return <div><h1>Todo App</h1><input /><button>Add Toggle Delete All Active Completed</button></div>;',
      '}',
    ].join('\n');

    let keepPreviewPendingResolve!: (val: unknown) => void;
    let firstPreviewCall = true;
    waitForPreviewEvidenceMock.mockImplementation(() => {
      if (firstPreviewCall) {
        firstPreviewCall = false;
        return new Promise((resolve) => {
          keepPreviewPendingResolve = resolve;
        });
      }
      return Promise.resolve({
        text: 'Todo App',
        elements: ['h1: Todo'],
        runtimeErrors: undefined,
        screenshotCaptured: true,
      });
    });

    runManagerMock.mockImplementation(async (opts) => {
      await opts.modelClient({
        task: 'generate-changes',
        messages: [{ role: 'user', content: 'hi' }],
      });
      await opts.modelClient({
        task: 'repair-changes',
        attempt: 2,
        messages: [{ role: 'user', content: 'fix' }],
      });
      opts.onMetrics({ tokensPerSec: 10 });
      opts.onTrace(makeTrace('running'));
      opts.onEvent({ type: 'routing', turn: 1, message: 'Planning changes' });
      opts.onEvent({ type: 'routing', turn: 2 });

      const nextFiles = { ...opts.files, 'src/App.jsx': updatedAppJsx };
      const validation = await opts.validate(nextFiles);
      expect(validation.status).toBe('passed');

      const preview = await opts.inspectPreview(nextFiles);
      expect(preview.status).toBe('passed');

      return {
        files: nextFiles,
        changes: [{ path: 'src/App.jsx', after: updatedAppJsx }],
        trace: makeTrace('success'),
      };
    });

    render(<LocalAIBenchmarkRunner />);

    // Wait until previewFrame is mounted while inspectPreview awaits waitForPreviewEvidence
    await waitFor(() => {
      expect(screen.getByTestId('preview-bridge')).toBeInTheDocument();
    });

    // Dispatch untrusted message (ignored)
    isTrustedPreviewMessageMock.mockReturnValueOnce(false);
    window.dispatchEvent(new MessageEvent('message', { data: { foo: 1 } }));
    expect(parsePreviewMessageMock).not.toHaveBeenCalled();

    // Dispatch trusted but unparseable message (ignored)
    isTrustedPreviewMessageMock.mockReturnValueOnce(true);
    parsePreviewMessageMock.mockReturnValueOnce(null);
    window.dispatchEvent(new MessageEvent('message', { data: 'bad' }));
    expect(reportPreviewRuntimeErrorMock).not.toHaveBeenCalled();

    // Dispatch RUNTIME_ERROR without message (ignored) and with message
    isTrustedPreviewMessageMock.mockReturnValueOnce(true);
    parsePreviewMessageMock.mockReturnValueOnce({ type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR });
    window.dispatchEvent(new MessageEvent('message', { data: {} }));
    expect(reportPreviewRuntimeErrorMock).not.toHaveBeenCalled();

    isTrustedPreviewMessageMock.mockReturnValueOnce(true);
    parsePreviewMessageMock.mockReturnValueOnce({
      type: PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION,
      message: 'boom',
    });
    window.dispatchEvent(new MessageEvent('message', { data: {} }));
    expect(reportPreviewRuntimeErrorMock).toHaveBeenCalledWith('boom');

    // Dispatch EVIDENCE message
    const evidencePayload = {
      type: PREVIEW_MESSAGE_TYPES.EVIDENCE,
      text: 'Todo App',
      elements: ['h1: Todo'],
      runtimeErrors: [],
      screenshotCaptured: true,
    };
    isTrustedPreviewMessageMock.mockReturnValueOnce(true);
    parsePreviewMessageMock.mockReturnValueOnce(evidencePayload);
    window.dispatchEvent(new MessageEvent('message', { data: evidencePayload }));
    expect(reportPreviewEvidenceMock).toHaveBeenCalledWith(evidencePayload);

    // Resolve preview evidence so run finishes and reuses both cached validation & cached preview
    await act(async () => {
      keepPreviewPendingResolve({
        text: 'Todo App',
        elements: ['h1: Todo'],
        screenshotCaptured: true,
      });
    });

    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('passed'));
    const { report } = getRenderedReport();
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0].status).toBe('passed');
    expect(report.cases[0].promptFingerprints).toHaveLength(2);
    expect(report.cases[0].promptFingerprints[0].attempt).toBeUndefined();
    expect(report.cases[0].promptFingerprints[1].attempt).toBe(2);
    expect(unloadAllWebLLMEnginesMock).toHaveBeenCalledTimes(1);
    expect(compilerResetMock).toHaveBeenCalledTimes(1);
  });

  it('handles ManagerRunError changes, build failure, missing preview URL, evidence timeout, and missing /dist/index.html', async () => {
    window.history.replaceState({}, '', '/ai-bench-local?case=todo');

    // First compile in validate passes, buildPreviewUrl returns null;
    // Second compile in finalBuild fails because /dist/index.html is missing!
    let containerExists = true;
    compilerGetContainerMock.mockImplementation(() =>
      containerExists ? { vfs: { existsSync: (p: string) => p === '/dist/index.html' } } : null,
    );
    buildPreviewUrlMock.mockReturnValue(null);

    runManagerMock.mockImplementation(async (opts) => {
      // Force inspectPreview failure when build fails
      compilerCompileMock.mockRejectedValueOnce('compile string error');
      const failedBuildPreview = await opts.inspectPreview(opts.files);
      expect(failedBuildPreview.status).toBe('failed');

      // Now build passes, but buildPreviewUrl returns null -> unavailable
      const noUrlPreview = await opts.inspectPreview(opts.files);
      expect(noUrlPreview.status).toBe('unavailable');
      expect(noUrlPreview.diagnostics).toContain('URL could not be created');

      // Throw ManagerRunError with add/modify/delete/empty-path changes
      containerExists = false;
      throw new ManagerRunError('Agent failed', {
        code: 'validation',
        phase: 'validation',
        trace: makeTrace('error'),
        changes: [
          { path: '', content: 'ignored' },
          { path: '', filePath: 'src/NewFile.js', content: 'export const x = 1;' },
          { path: 'src/App.jsx', after: DEFAULT_CONTENTS['src/App.jsx'] },
          { path: 'src/Unused.js', delete: true },
          { path: 'src/NoContent.js' },
        ],
      });
    });

    render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('failed'));
    const { report } = getRenderedReport();
    expect(report.cases[0].status).toBe('failed');
    expect(report.cases[0].error).toBe('Agent failed');
    expect(report.cases[0].build.status).toBe('failed');
    expect(report.cases[0].build.diagnostics.join('\n')).toContain(
      'without producing /dist/index.html',
    );
    expect(report.cases[0].files['src/NewFile.js']).toBe('export const x = 1;');
  });

  it('handles generic non-ManagerRunError, preview evidence timeout fallback, and outer setup catch', async () => {
    window.history.replaceState({}, '', '/ai-bench-local?case=todo');

    // Case A: non-ManagerRunError + waitForPreviewEvidence returning null
    waitForPreviewEvidenceMock.mockResolvedValue(null);
    runManagerMock.mockImplementation(async (opts) => {
      opts.onTrace(makeTrace('running'));
      throw 'non-error failure';
    });

    const first = render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('failed'));
    expect(getRenderedReport().report.cases[0].error).toBe('non-error failure');
    expect(getRenderedReport().report.cases[0].preview.status).toBe('unavailable');
    first.unmount();

    // Case B: outer try/catch when loadManagerModel rejects and unloadAllWebLLMEngines rejects
    loadManagerModelMock.mockRejectedValueOnce(new Error('model load exploded'));
    unloadAllWebLLMEnginesMock.mockRejectedValueOnce(new Error('unload failed'));
    render(<LocalAIBenchmarkRunner />);
    await waitFor(() => expect(getRenderedReport().statusAttr).toBe('error'));
    expect(getRenderedReport().report.setupError).toBe('model load exploded');
    expect(compilerResetMock).toHaveBeenCalled();
    expect(unloadAllWebLLMEnginesMock).toHaveBeenCalled();
  });
});
