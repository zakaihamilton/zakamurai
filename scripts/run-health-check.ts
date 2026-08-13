import { spawnSync } from 'node:child_process';

type HealthFinding = {
  severity?: string;
};

type HealthResult = {
  name: string;
  status: string;
  findings?: HealthFinding[];
};

type HealthReport = {
  summary?: {
    findings?: number;
    errors?: number;
  };
  results?: HealthResult[];
};

const result = spawnSync('repnix', ['check', '--format', 'json'], {
  encoding: 'utf8',
});

if (result.error) {
  console.error(`Unable to run RepNix: ${result.error.message}`);
  process.exit(1);
}

let report: HealthReport;

try {
  report = JSON.parse(result.stdout) as HealthReport;
} catch {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const results = report.results ?? [];
const blockingResults = results.filter((entry) => entry.status === 'error');
const blockingFindings = results.flatMap((entry) =>
  (entry.findings ?? []).filter((finding) => finding.severity === 'error'),
);

console.log('Repository health check');
console.log('');

for (const entry of results) {
  const hasBlockingFinding = (entry.findings ?? []).some((finding) => finding.severity === 'error');
  const status = entry.status === 'pass' && !hasBlockingFinding ? 'PASS' : 'WARN';
  const findingCount = entry.findings?.length ?? 0;
  console.log(`${status.padEnd(7)} ${entry.name.padEnd(28)} ${findingCount} finding(s)`);
}

console.log('');
console.log(
  `${report.summary?.findings ?? 0} finding(s) reported; ${blockingFindings.length} blocking finding(s) and ${blockingResults.length} provider error(s).`,
);

process.exitCode = blockingResults.length > 0 || blockingFindings.length > 0 ? 1 : 0;
