import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeLocalAIBenchmarkReport(
  reportPath: string,
  report: object,
): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
