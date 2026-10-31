import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, type Page, chromium } from '@playwright/test';
import {
  LOCAL_AI_BENCHMARK_CHROMIUM_CHANNEL,
  getLocalAIBenchmarkChromiumArgs,
  getLocalAIBenchmarkDevServerEnv,
} from './ai-bench-browser';
import {
  LOCAL_AI_BENCHMARK_USAGE,
  type LocalAIBenchmarkCliOptions,
  parseLocalAIBenchmarkArgs,
} from './ai-bench-cli';
import { writeLocalAIBenchmarkReport } from './ai-bench-report';

type BrowserBenchmarkCaseReport = {
  id: string;
  request: string;
  status: 'passed' | 'failed';
  startedAt: string;
  durationMs: number;
  model: string;
  seed: number;
  promptFingerprints: Array<{ task: string; attempt?: number; fingerprint: string }>;
  metrics: unknown[];
  trace: unknown | null;
  error: string | null;
  changes: unknown[];
  checks: Array<{ id: string; label: string; passed: boolean; details?: string }>;
  validationRuns: Array<{ fingerprint: string; status: string; diagnostics: string[] }>;
  build: { status: string; diagnostics: string[] };
  preview: unknown | null;
  files: Record<string, string>;
};

type BrowserBenchmarkReport = {
  version: 1;
  status: 'running' | 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt?: string;
  model: string;
  cases: BrowserBenchmarkCaseReport[];
  setupError?: string;
  git?: { revision: string; dirtyFiles: string[] };
  browser?: string;
  caseFilter?: string | null;
};

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePort = Number(process.env.ZAKAMURAI_AI_BENCH_PORT || 3234);
const previewPort = basePort + 1;
const appUrl = `http://localhost:${basePort}`;
const routePath = '/ai-bench-local';
const startupTimeoutMs = 180_000;
const benchmarkTimeoutMs = 2 * 60 * 60 * 1000;

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function waitForBenchRoute(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + startupTimeoutMs;
  const url = `${appUrl}${routePath}`;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Local dev server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for ${url}. Check the local dev-server output.`);
}

async function waitForPageResult(page: Page): Promise<BrowserBenchmarkReport> {
  await page.waitForFunction(
    () => {
      const element = document.querySelector('#ai-bench-result');
      return ['passed', 'failed', 'error'].includes(element?.getAttribute('data-status') || '');
    },
    undefined,
    { timeout: benchmarkTimeoutMs },
  );
  const value = await page.locator('#ai-bench-result').textContent();
  if (!value) throw new Error('Benchmark page returned an empty result.');
  return JSON.parse(value) as BrowserBenchmarkReport;
}

function createFallbackReport(modelId: string, error: unknown): BrowserBenchmarkReport {
  return {
    version: 1,
    status: 'error',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    model: modelId,
    cases: [],
    setupError: error instanceof Error ? error.message : String(error),
  };
}

function printSummary(report: BrowserBenchmarkReport, reportPath: string): void {
  console.log(`\nLocal Build with AI benchmark: ${report.status}`);
  console.log(`Model: ${report.model}`);
  for (const benchmarkCase of report.cases) {
    const passed = benchmarkCase.checks.filter((check) => check.passed).length;
    console.log(
      `  ${benchmarkCase.status === 'passed' ? 'PASS' : 'FAIL'} ${benchmarkCase.id} (${passed}/${benchmarkCase.checks.length} checks, ${(benchmarkCase.durationMs / 1000).toFixed(1)}s, ${benchmarkCase.promptFingerprints.length} model calls)`,
    );
    for (const check of benchmarkCase.checks.filter((item) => !item.passed)) {
      console.log(`    - ${check.label}${check.details ? `: ${check.details}` : ''}`);
    }
    if (benchmarkCase.error) console.log(`    - Manager error: ${benchmarkCase.error}`);
  }
  if (report.setupError) console.log(`Setup error: ${report.setupError}`);
  console.log(`Report: ${reportPath}`);
}

async function stopDevServer(server: ChildProcess | null): Promise<void> {
  if (!server?.pid || server.exitCode !== null) return;
  if (process.platform === 'win32') server.kill('SIGTERM');
  else process.kill(-server.pid, 'SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => server.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGKILL');
    else process.kill(-server.pid, 'SIGKILL');
  }
}

async function closeBrowser(context: BrowserContext | null): Promise<void> {
  if (!context) return;
  try {
    await context.close();
  } catch {
    // The context can already be closed if Chromium failed during startup.
  }
}

async function main(): Promise<void> {
  let options: LocalAIBenchmarkCliOptions;
  try {
    options = parseLocalAIBenchmarkArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(LOCAL_AI_BENCHMARK_USAGE);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(LOCAL_AI_BENCHMARK_USAGE);
    return;
  }

  const startedAt = new Date().toISOString();
  const defaultModel =
    options.modelId || process.env.ZAKAMURAI_AI_MODEL || 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC';
  const artifactRoot = path.join(repositoryRoot, 'test-results', 'ai-bench');
  const runId = new Date().toISOString().replaceAll(':', '-');
  const reportDirectory = path.join(artifactRoot, `run-${runId}`);
  const reportPath = path.join(reportDirectory, 'report.json');
  const browserProfilePath = path.join(artifactRoot, 'browser-profile');
  await mkdir(reportDirectory, { recursive: true });
  await mkdir(browserProfilePath, { recursive: true });

  let report: BrowserBenchmarkReport = createFallbackReport(
    defaultModel,
    new Error('Benchmark did not start.'),
  );
  let server: ChildProcess | null = null;
  let context: BrowserContext | null = null;
  let git: BrowserBenchmarkReport['git'];

  try {
    if (!(await isPortAvailable(basePort)) || !(await isPortAvailable(previewPort))) {
      throw new Error(
        `Benchmark ports ${basePort}/${previewPort} are in use. Set ZAKAMURAI_AI_BENCH_PORT to an unused port pair.`,
      );
    }

    const gitRevision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
    const gitChanges = execFileSync('git', ['status', '--short'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    git = { revision: gitRevision, dirtyFiles: gitChanges };

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const devServer = spawn(npmCommand, ['run', 'dev'], {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      stdio: 'inherit',
      env: {
        ...getLocalAIBenchmarkDevServerEnv(process.env, process.platform),
        PLAYWRIGHT_IDE_PORT: String(basePort),
        PLAYWRIGHT_PREVIEW_PORT: String(previewPort),
        ZAKAMURAI_AI_BENCH: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });
    server = devServer;
    await waitForBenchRoute(devServer);

    context = await chromium.launchPersistentContext(browserProfilePath, {
      headless: true,
      channel: LOCAL_AI_BENCHMARK_CHROMIUM_CHANNEL,
      viewport: { width: 1280, height: 900 },
      args: getLocalAIBenchmarkChromiumArgs(process.platform),
    });
    const page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(benchmarkTimeoutMs);
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[browser] ${message.text()}`);
    });

    const query = new URLSearchParams();
    const selectedModel = options.modelId || process.env.ZAKAMURAI_AI_MODEL;
    if (selectedModel) query.set('model', selectedModel);
    if (options.caseId) query.set('case', options.caseId);
    await page.goto(`${appUrl}${routePath}?${query.toString()}`, { timeout: startupTimeoutMs });
    report = await waitForPageResult(page);
    report.startedAt = startedAt;
    report.finishedAt = new Date().toISOString();
  } catch (error) {
    report = createFallbackReport(defaultModel, error);
    report.startedAt = startedAt;
  } finally {
    await closeBrowser(context);
    await stopDevServer(server);
  }

  report.git = git;
  report.browser = 'Playwright Chromium new headless with platform-specific WebGPU flags';
  report.caseFilter = options.caseId || null;
  await writeLocalAIBenchmarkReport(reportPath, report);
  printSummary(report, reportPath);
  if (report.status !== 'passed') process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
