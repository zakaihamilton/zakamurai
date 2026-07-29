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

export function checkComponentModularity(files: FileMap = {}): {
  passed: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const appPath = Object.keys(files).find((p) => /^src\/App\.(jsx|tsx|js|ts)$/.test(p));
  if (appPath) {
    const content = files[appPath] || '';
    const lineCount = content.split('\n').length;
    const hasSubComponents = Object.keys(files).some((p) => p.startsWith('src/components/'));

    if (lineCount > 150 && !hasSubComponents) {
      errors.push(
        `Monolithic ${appPath} detected (${lineCount} lines) without sub-components in src/components/. Split UI into modular components.`,
      );
    }
  }

  const componentPaths = Object.keys(files).filter(
    (p) => p.startsWith('src/components/') && /\.(jsx|tsx)$/.test(p),
  );

  for (const compPath of componentPaths) {
    const baseName = compPath.replace(/\.(jsx|tsx)$/, '');
    const hasMatchingModuleCss =
      Boolean(files[`${baseName}.module.css`]) ||
      Object.keys(files).some((p) => p.endsWith('.module.css'));
    const content = files[compPath] || '';
    const importsModuleCss = /\.module\.css['"]/.test(content);

    if (!hasMatchingModuleCss && !importsModuleCss) {
      errors.push(
        `Component ${compPath} lacks a co-located *.module.css style file or CSS module import.`,
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

const clip = (value: unknown): string => {
  const text = String(value || '');
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…[truncated]` : text;
};
