import type { FileMap, VerificationResult } from '@/components/AI/types';
import { parseBuildCommand } from '@/utils/compiler/browser-bundler';

const BLOCKED_NAME =
  /(?:^|:|-)(?:pre|post)?(?:dev|start|serve|format|fix|install|uninstall|update|setup|prepare)(?:$|:|-)/i;
const MAX_OUTPUT = 12000;

export function listProjectChecks(files: FileMap = {}): string[] {
  try {
    const pkg = JSON.parse(files['package.json'] || '{}') as { scripts?: Record<string, string> };
    return Object.entries(pkg.scripts || {})
      .filter(([name, command]) => isEligibleProjectCheck(name, command))
      .map(([name]) => name)
      .sort();
  } catch {
    return [];
  }
}

export function isEligibleProjectCheck(name: string, command: string | null): boolean {
  if (!name || typeof command !== 'string' || BLOCKED_NAME.test(name)) return false;
  try {
    const parts = parseBuildCommand(command);
    return parts.length > 0 && parts.every((argv) => argv.length > 0);
  } catch {
    return false;
  }
}

type RunProjectCheckOptions = {
  check: string;
  files: FileMap;
  run?: ((check: string, files: FileMap) => Promise<string>) | null;
};

export async function runProjectCheck({
  check,
  files,
  run,
}: RunProjectCheckOptions): Promise<VerificationResult> {
  const checks = listProjectChecks(files);
  if (!checks.includes(check)) throw new Error(`Project check is not eligible: ${check}`);
  if (typeof run !== 'function') return unavailableProjectCheck(check);
  try {
    const output = await run(check, files);
    return {
      status: 'passed',
      check,
      diagnostics: clip(output),
      output: clip(output),
    };
  } catch (error) {
    const err = error as { message?: string };
    const diagnostics = clip(err?.message || error);
    return { status: 'failed', check, diagnostics, output: diagnostics };
  }
}

export const unavailableProjectCheck = (check = 'project'): VerificationResult => ({
  status: 'unavailable',
  check,
  diagnostics: 'Project check execution is unavailable in this session.',
  output: '',
});

const clip = (value: unknown): string => {
  const text = String(value || '');
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…[truncated]` : text;
};
