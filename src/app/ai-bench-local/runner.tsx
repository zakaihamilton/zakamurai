'use client';

import { runManager } from '@/components/AI/Agent';
import { loadManagerModel } from '@/components/AI/Agent/ManagerModelClient';
import { ManagerRunError, type ManagerTrace } from '@/components/AI/Agent/ManagerTrace';
import {
  LOCAL_AI_BENCHMARK_CASES,
  type LocalAIBenchmarkCase,
  type LocalAIBenchmarkPreview,
  evaluateLocalAIBenchmarkCase,
  fingerprintFiles,
  fingerprintPromptMessages,
  getLocalAIBenchmarkModelError,
  getLocalAIBenchmarkSetupError,
} from '@/components/AI/LocalBenchmark';
import { unloadAllWebLLMEngines } from '@/components/AI/WebLLMAPI';
import { RECOMMENDED_WEB_LLM_MODEL, WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import type {
  AgentChange,
  FileMap,
  ManagerModelCall,
  ManagerModelClient,
  RunManagerResult,
  WebLLMGenerationMetrics,
} from '@/components/AI/types';
import PreviewBridge from '@/components/App/Views/PreviewArea/PreviewBridge';
import type { PreviewEvidence } from '@/components/App/Views/PreviewArea/preview-types';
import {
  clearPreviewEvidence,
  reportPreviewEvidence,
  reportPreviewRuntimeError,
  waitForPreviewEvidence,
} from '@/components/App/Views/PreviewArea/previewEvidenceBridge';
import {
  buildPreviewUrl,
  getPreviewOrigins,
} from '@/components/App/Views/PreviewArea/previewOrigins';
import {
  PREVIEW_MESSAGE_TYPES,
  isTrustedPreviewMessage,
  parsePreviewMessage,
} from '@/components/App/Views/PreviewArea/previewSandbox';
import { PREVIEW_IFRAME_SANDBOX } from '@/components/App/Views/PreviewArea/previewSandbox';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '@/components/Storage/InitialData';
import { Compiler } from '@/utils/compiler';
import type { FolderTreeNode, LocalFsLike } from '@/utils/compiler/types';
import { useEffect, useRef, useState } from 'react';
import styles from './runner.module.css';

const FIXED_SEED = 101;
const PREVIEW_EVIDENCE_TIMEOUT_MS = 20_000;
const LOCAL_FS: LocalFsLike = { mode: 'opfs' };
const STARTER_TREE = DEFAULT_FILES as FolderTreeNode[];

type BenchmarkCaseReport = {
  id: string;
  request: string;
  status: 'passed' | 'failed';
  startedAt: string;
  durationMs: number;
  model: string;
  seed: number;
  promptFingerprints: Array<{
    task: ManagerModelCall['task'];
    attempt?: number;
    fingerprint: string;
  }>;
  metrics: WebLLMGenerationMetrics[];
  trace: ManagerTrace | null;
  error: string | null;
  changes: AgentChange[];
  checks: ReturnType<typeof evaluateLocalAIBenchmarkCase>['checks'];
  validationRuns: Array<{ fingerprint: string; status: string; diagnostics: string[] }>;
  build: { status: string; diagnostics: string[] };
  preview: LocalAIBenchmarkPreview | null;
  files: FileMap;
};

type BenchmarkReport = {
  version: 1;
  status: 'running' | 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt?: string;
  model: string;
  cases: BenchmarkCaseReport[];
  setupError?: string;
};

type PreviewFrame = {
  sessionId: string;
  url: string;
  origin: string;
  handshakeNonce: number;
};

function cloneStarterFiles(): FileMap {
  return { ...DEFAULT_CONTENTS };
}

function filesFromErrorChanges(startingFiles: FileMap, changes: AgentChange[]): FileMap {
  const files = { ...startingFiles };
  for (const change of changes) {
    const path = change.path || change.filePath;
    if (!path) continue;
    if (change.delete) delete files[path];
    else {
      const content = change.after ?? change.content;
      if (content !== undefined) files[path] = content;
    }
  }
  return files;
}

function asPreviewEvidence(evidence: PreviewEvidence | null): LocalAIBenchmarkPreview | null {
  if (!evidence) return null;
  return {
    status: 'passed',
    domSummary: evidence.text,
    elements: evidence.elements,
    runtimeErrors: evidence.runtimeErrors || [],
    screenshotCaptured: evidence.screenshotCaptured,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selectedCasesFromLocation(): {
  model: string;
  cases: LocalAIBenchmarkCase[];
  error: string | null;
} {
  const query = new URLSearchParams(window.location.search);
  const model = query.get('model') || RECOMMENDED_WEB_LLM_MODEL.id;
  const modelError = getLocalAIBenchmarkModelError(
    model,
    WEB_LLM_MODELS.map((item) => item.id),
  );
  if (modelError) return { model, cases: [], error: modelError };

  const requestedCase = query.get('case');
  if (!requestedCase) return { model, cases: LOCAL_AI_BENCHMARK_CASES, error: null };
  const benchmarkCase = LOCAL_AI_BENCHMARK_CASES.find((item) => item.id === requestedCase);
  if (!benchmarkCase) {
    return {
      model,
      cases: [],
      error: `Unknown benchmark case '${requestedCase}'. Choose ${LOCAL_AI_BENCHMARK_CASES.map((item) => item.id).join(', ')}.`,
    };
  }
  return { model, cases: [benchmarkCase], error: null };
}

async function readWebGPUAvailability(): Promise<{
  hasWebGPU: boolean;
  hasAdapter: boolean;
  hasShaderF16: boolean;
}> {
  const gpu = (
    navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          features?: { has: (feature: string) => boolean };
        } | null>;
      };
    }
  ).gpu;
  if (!gpu) return { hasWebGPU: false, hasAdapter: false, hasShaderF16: false };
  try {
    const adapter = await gpu.requestAdapter();
    return {
      hasWebGPU: true,
      hasAdapter: Boolean(adapter),
      hasShaderF16: adapter?.features?.has('shader-f16') ?? false,
    };
  } catch {
    return { hasWebGPU: true, hasAdapter: false, hasShaderF16: false };
  }
}

export default function LocalAIBenchmarkRunner() {
  const [status, setStatus] = useState('starting');
  const [message, setMessage] = useState('Preparing local benchmark…');
  const [reportJson, setReportJson] = useState('{"status":"starting"}');
  const [previewFrame, setPreviewFrame] = useState<PreviewFrame | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const previewNonceRef = useRef(0);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    void runBenchmark();
  }, []);

  useEffect(() => {
    if (!previewFrame) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedPreviewMessage(event, frameRef.current?.contentWindow, previewFrame.origin)) {
        return;
      }
      const payload = parsePreviewMessage(event.data);
      if (!payload) return;
      if (
        payload.type === PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR ||
        payload.type === PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION
      ) {
        if (payload.message) reportPreviewRuntimeError(payload.message);
      } else if (payload.type === PREVIEW_MESSAGE_TYPES.EVIDENCE) {
        reportPreviewEvidence(payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [previewFrame]);

  const runBenchmark = async () => {
    const startedAt = new Date().toISOString();
    const selection = selectedCasesFromLocation();
    const report: BenchmarkReport = {
      version: 1,
      status: 'running',
      startedAt,
      model: selection.model,
      cases: [],
    };

    const finish = (nextStatus: BenchmarkReport['status'], setupError?: string) => {
      report.status = nextStatus;
      report.finishedAt = new Date().toISOString();
      if (setupError) report.setupError = setupError;
      setReportJson(JSON.stringify(report));
      setStatus(nextStatus);
      setMessage(setupError || `${report.cases.length} case(s) finished.`);
    };

    try {
      if (selection.error) {
        finish('error', selection.error);
        return;
      }
      const gpu = await readWebGPUAvailability();
      const setupError = getLocalAIBenchmarkSetupError({
        ...gpu,
        hasWorkers: typeof Worker !== 'undefined',
      });
      if (setupError) {
        finish('error', setupError);
        return;
      }

      setStatus('running');
      const productionModelClient = await loadManagerModel();
      const origins = getPreviewOrigins({ windowOrigin: window.location.origin });
      const previewOrigin = origins.previewOrigin;
      if (!previewOrigin || !origins.ideOrigin) {
        finish('error', 'The local preview origins could not be resolved.');
        return;
      }

      for (const benchmarkCase of selection.cases) {
        setMessage(`Running ${benchmarkCase.id}: ${benchmarkCase.request}`);
        const caseStarted = Date.now();
        const caseStartedAt = new Date(caseStarted).toISOString();
        const startingFiles = cloneStarterFiles();
        const promptFingerprints: BenchmarkCaseReport['promptFingerprints'] = [];
        const metrics: WebLLMGenerationMetrics[] = [];
        const validationRuns: Array<{
          fingerprint: string;
          status: string;
          diagnostics: string[];
        }> = [];
        let latestTrace: ManagerTrace | null = null;
        const latestPreviewRef: {
          current: { fingerprint: string; result: LocalAIBenchmarkPreview | null } | null;
        } = { current: null };

        const compileFiles = async (files: FileMap) => {
          const diagnostics: string[] = [];
          const compiler = new Compiler((line) => diagnostics.push(line));
          try {
            await compiler.compile(LOCAL_FS, STARTER_TREE, files);
            const container = Compiler.getContainer();
            if (!container?.vfs.existsSync('/dist/index.html')) {
              throw new Error('Compiler completed without producing /dist/index.html.');
            }
            return { status: 'passed', diagnostics };
          } catch (error) {
            diagnostics.push(errorMessage(error));
            return { status: 'failed', diagnostics };
          }
        };

        const validate = async (files: FileMap) => {
          const fingerprint = fingerprintFiles(files);
          const result = await compileFiles(files);
          const validation = {
            fingerprint,
            status: result.status,
            diagnostics: result.diagnostics.slice(-20),
          };
          validationRuns.push(validation);
          return {
            status: result.status,
            check: 'build',
            diagnostics: result.diagnostics.slice(-20).join('\n'),
          };
        };

        const inspectPreview = async (files: FileMap): Promise<LocalAIBenchmarkPreview> => {
          const fingerprint = fingerprintFiles(files);
          const build = await compileFiles(files);
          if (build.status !== 'passed') {
            const failed = {
              status: 'failed',
              diagnostics: build.diagnostics.slice(-20).join('\n'),
              runtimeErrors: [],
              screenshotCaptured: false,
            } satisfies LocalAIBenchmarkPreview;
            latestPreviewRef.current = { fingerprint, result: failed };
            return failed;
          }

          const sessionId = `ai-bench-${benchmarkCase.id}-${Date.now()}-${previewNonceRef.current + 1}`;
          const previewUrl = buildPreviewUrl(origins, sessionId);
          if (!previewUrl) {
            const failed = {
              status: 'unavailable',
              diagnostics: 'The local preview URL could not be created.',
              runtimeErrors: [],
              screenshotCaptured: false,
            } satisfies LocalAIBenchmarkPreview;
            latestPreviewRef.current = { fingerprint, result: failed };
            return failed;
          }

          const evidenceRevision = clearPreviewEvidence();
          previewNonceRef.current += 1;
          setPreviewFrame({
            sessionId,
            url: previewUrl,
            origin: previewOrigin,
            handshakeNonce: previewNonceRef.current,
          });
          const evidence = await waitForPreviewEvidence(
            evidenceRevision,
            PREVIEW_EVIDENCE_TIMEOUT_MS,
          );
          const result = asPreviewEvidence(evidence) || {
            status: 'unavailable',
            diagnostics: `Preview did not report render evidence within ${PREVIEW_EVIDENCE_TIMEOUT_MS}ms.`,
            runtimeErrors: [],
            screenshotCaptured: false,
          };
          latestPreviewRef.current = { fingerprint, result };
          return result;
        };

        let result: RunManagerResult | null = null;
        let managerError: string | null = null;
        let failedChanges: AgentChange[] = [];
        let managerTrace: ManagerTrace | null = null;
        const modelClient: ManagerModelClient = async (call) => {
          promptFingerprints.push({
            task: call.task,
            ...(call.attempt === undefined ? {} : { attempt: call.attempt }),
            fingerprint: fingerprintPromptMessages(call.messages),
          });
          setMessage(`Running ${benchmarkCase.id}: ${call.task} attempt ${call.attempt || 1}`);
          return productionModelClient(call);
        };

        try {
          result = await runManager({
            request: benchmarkCase.request,
            files: startingFiles,
            scope: 'project',
            model: selection.model,
            sessionId: `local-ai-bench-${benchmarkCase.id}-${Date.now()}`,
            seed: FIXED_SEED,
            priorContext: 'Project preflight: No project preflight issues detected.',
            modelClient,
            validate,
            inspectPreview,
            onMetrics: (nextMetrics) => metrics.push({ ...nextMetrics }),
            onTrace: (trace) => {
              latestTrace = trace;
            },
            onEvent: (event) => {
              if (event.message) setMessage(`${benchmarkCase.id}: ${event.message}`);
            },
          });
          managerTrace = result.trace;
        } catch (error) {
          managerError = errorMessage(error);
          if (error instanceof ManagerRunError) {
            managerTrace = error.trace;
            failedChanges = error.changes;
          } else {
            managerTrace = latestTrace;
          }
        }

        const finalFiles = result?.files || filesFromErrorChanges(startingFiles, failedChanges);
        const finalFingerprint = fingerprintFiles(finalFiles);
        const lastValidation = validationRuns.at(-1);
        const finalBuild =
          lastValidation?.fingerprint === finalFingerprint
            ? { status: lastValidation.status, diagnostics: lastValidation.diagnostics }
            : await compileFiles(finalFiles);
        if (
          finalBuild.status !== 'passed' &&
          validationRuns.at(-1)?.fingerprint !== finalFingerprint
        ) {
          validationRuns.push({
            fingerprint: finalFingerprint,
            status: finalBuild.status,
            diagnostics: finalBuild.diagnostics.slice(-20),
          });
        }

        const lastPreview = latestPreviewRef.current;
        const finalPreview =
          lastPreview?.fingerprint === finalFingerprint && lastPreview.result
            ? lastPreview.result
            : await inspectPreview(finalFiles);
        const evaluation = evaluateLocalAIBenchmarkCase({
          benchmarkCase,
          startingFiles,
          files: finalFiles,
          buildStatus: finalBuild.status,
          preview: finalPreview,
        });
        const caseReport: BenchmarkCaseReport = {
          id: benchmarkCase.id,
          request: benchmarkCase.request,
          status: evaluation.passed && !managerError ? 'passed' : 'failed',
          startedAt: caseStartedAt,
          durationMs: Date.now() - caseStarted,
          model: selection.model,
          seed: FIXED_SEED,
          promptFingerprints,
          metrics,
          trace: managerTrace,
          error: managerError,
          changes: result?.changes || failedChanges,
          checks: evaluation.checks,
          validationRuns,
          build: {
            status: finalBuild.status,
            diagnostics: finalBuild.diagnostics.slice(-20),
          },
          preview: finalPreview,
          files: finalFiles,
        };
        report.cases.push(caseReport);
        setPreviewFrame(null);
        await Compiler.reset();
      }

      await unloadAllWebLLMEngines();
      finish(report.cases.every((item) => item.status === 'passed') ? 'passed' : 'failed');
    } catch (error) {
      try {
        await Compiler.reset();
        await unloadAllWebLLMEngines();
      } catch {
        // Preserve the original setup or benchmark error in the report.
      }
      finish('error', errorMessage(error));
    }
  };

  return (
    <main>
      <h1>Local Build with AI benchmark</h1>
      <p id="ai-bench-status">{message}</p>
      <pre id="ai-bench-result" data-status={status}>
        {reportJson}
      </pre>
      {previewFrame && (
        <>
          <iframe
            key={`${previewFrame.sessionId}-${previewFrame.handshakeNonce}`}
            ref={frameRef}
            className={styles.previewFrame}
            src={previewFrame.url}
            name={`zakamurai-preview-${previewFrame.sessionId}`}
            title="Local benchmark preview"
            sandbox={PREVIEW_IFRAME_SANDBOX}
          />
          <PreviewBridge
            iframeRef={frameRef}
            sessionId={previewFrame.sessionId}
            previewOrigin={previewFrame.origin}
            iframeHandshakeNonce={previewFrame.handshakeNonce}
          />
        </>
      )}
    </main>
  );
}
