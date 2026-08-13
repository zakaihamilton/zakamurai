import { spawnSync } from 'node:child_process';

type HealthResult = {
  name: string;
  status: string;
  findings?: unknown[];
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

console.log('Repository health check');
console.log('');

for (const entry of results) {
  const status = entry.status === 'pass' ? 'PASS' : 'WARN';
  const findingCount = entry.findings?.length ?? 0;
  console.log(`${status.padEnd(7)} ${entry.name.padEnd(28)} ${findingCount} finding(s)`);
}

console.log('');
console.log(
  `${report.summary?.findings ?? 0} finding(s) reported; ${blockingResults.length} provider error(s).`,
);

process.exitCode = blockingResults.length > 0 ? 1 : 0;
