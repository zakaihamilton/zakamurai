import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type MetricSample = {
  requestKind?: string;
  modelId?: string;
  outcome?: string;
  totalMs?: number;
  initializationMs?: number;
  timeToFirstTokenMs?: number;
  recoveryCount?: number;
  jsHeapUsedMBAtEnd?: number;
  jsHeapDeltaMB?: number;
};

type SupportReport = {
  diagnostics?: Array<{
    source?: string;
    message?: string;
    details?: string;
  }>;
};

type MetricGroup = {
  count: number;
  averageTotalMs: number | null;
  p95TotalMs: number | null;
};

const finiteNumbers = (values: Array<number | undefined>): number[] =>
  values.filter((value): value is number => Number.isFinite(value));

const round = (value: number): number => Math.round(value * 100) / 100;

const average = (values: number[]): number | null =>
  values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

const percentile = (values: number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
};

export const extractWebLLMMetrics = (report: SupportReport): MetricSample[] =>
  (report.diagnostics || []).flatMap((event) => {
    if (event.source !== 'webllm' || !event.message?.startsWith('Local AI ') || !event.details) {
      return [];
    }
    try {
      const parsed = JSON.parse(event.details) as MetricSample;
      return parsed && typeof parsed === 'object' ? [parsed] : [];
    } catch {
      return [];
    }
  });

const groupMetrics = (samples: MetricSample[], key: 'requestKind' | 'modelId') =>
  Object.fromEntries(
    [...new Set(samples.map((sample) => sample[key] || 'unknown'))].map((value) => {
      const group = samples.filter((sample) => (sample[key] || 'unknown') === value);
      const totalTimes = finiteNumbers(group.map((sample) => sample.totalMs));
      const summary: MetricGroup = {
        count: group.length,
        averageTotalMs: average(totalTimes),
        p95TotalMs: percentile(totalTimes, 0.95),
      };
      return [value, summary];
    }),
  );

export const summarizeWebLLMMetrics = (samples: MetricSample[]) => {
  const totalTimes = finiteNumbers(samples.map((sample) => sample.totalMs));
  const initializationTimes = finiteNumbers(samples.map((sample) => sample.initializationMs));
  const firstTokenTimes = finiteNumbers(samples.map((sample) => sample.timeToFirstTokenMs));
  const heapDeltas = finiteNumbers(samples.map((sample) => sample.jsHeapDeltaMB));
  const heapEnds = finiteNumbers(samples.map((sample) => sample.jsHeapUsedMBAtEnd));

  return {
    requestCount: samples.length,
    outcomes: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.outcome || 'unknown'))].map((outcome) => [
        outcome,
        samples.filter((sample) => (sample.outcome || 'unknown') === outcome).length,
      ]),
    ),
    initializationCount: initializationTimes.length,
    recoveredRequestCount: samples.filter((sample) => (sample.recoveryCount || 0) > 0).length,
    totalRecoveryCount: samples.reduce((sum, sample) => sum + (sample.recoveryCount || 0), 0),
    averageTotalMs: average(totalTimes),
    p95TotalMs: percentile(totalTimes, 0.95),
    averageInitializationMs: average(initializationTimes),
    averageTimeToFirstTokenMs: average(firstTokenTimes),
    p95TimeToFirstTokenMs: percentile(firstTokenTimes, 0.95),
    averageJSHeapDeltaMB: average(heapDeltas),
    p95JSHeapDeltaMB: percentile(heapDeltas, 0.95),
    maxJSHeapUsedMB: heapEnds.length > 0 ? round(Math.max(...heapEnds)) : null,
    byRequestKind: groupMetrics(samples, 'requestKind'),
    byModel: groupMetrics(samples, 'modelId'),
  };
};

async function main(): Promise<void> {
  const reportPath = process.argv[2];
  if (!reportPath) {
    throw new Error('Usage: npm run analyze:ai -- <support-report.json>');
  }
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8')) as SupportReport;
  const samples = extractWebLLMMetrics(report);
  if (samples.length === 0) {
    throw new Error('No WebLLM generation metrics were found in this support report.');
  }
  console.log(JSON.stringify(summarizeWebLLMMetrics(samples), null, 2));
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
