import { parseBuildCommand } from '@/utils/compiler/browser-bundler';

const BLOCKED_NAME =
  /(?:^|:|-)(?:pre|post)?(?:dev|start|serve|format|fix|install|uninstall|update|setup|prepare)(?:$|:|-)/i;
const MAX_OUTPUT = 12000;

export function listProjectChecks(files = {}) {
  try {
    const pkg = JSON.parse(files['package.json'] || '{}');
    return Object.entries(pkg.scripts || {})
      .filter(([name, command]) => isEligibleProjectCheck(name, command))
      .map(([name]) => name)
      .sort();
  } catch {
    return [];
  }
}

export function isEligibleProjectCheck(name, command) {
  if (!name || typeof command !== 'string' || BLOCKED_NAME.test(name)) return false;
  try {
    const parts = parseBuildCommand(command);
    return parts.length > 0 && parts.every((argv) => argv.length > 0);
  } catch {
    return false;
  }
}

export async function runProjectCheck({ check, files, run }) {
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
    const diagnostics = clip(error?.message || error);
    return { status: 'failed', check, diagnostics, output: diagnostics };
  }
}

export const unavailableProjectCheck = (check = 'project') => ({
  status: 'unavailable',
  check,
  diagnostics: 'Project check execution is unavailable in this session.',
  output: '',
});

const clip = (value) => {
  const text = String(value || '');
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…[truncated]` : text;
};
