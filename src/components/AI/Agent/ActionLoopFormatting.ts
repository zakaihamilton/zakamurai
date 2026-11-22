import type { AgentAction } from '@/components/AI/types';

const MAX_REASONING_RESULT_CHARS = 3000;

const truncateReasoningResult = (value: string): string =>
  value.length > MAX_REASONING_RESULT_CHARS
    ? `${value.slice(0, MAX_REASONING_RESULT_CHARS)}\n…[tool result truncated in reasoning log]`
    : value;

export const observation = (action: string, ok: boolean, data: unknown): string =>
  JSON.stringify({ tool: action, ok, ...(ok ? { result: data } : { error: data }) });

export const formatReasoningResult = (action: AgentAction, result: unknown): string => {
  const text = String(result ?? '');
  const lines = text ? text.split('\n').filter(Boolean) : [];

  if (action.action === 'list_files') {
    const scope = action.query ? ` matching “${action.query}”` : '';
    return truncateReasoningResult(
      lines.length ? `Found ${lines.length} file(s)${scope}:\n${text}` : `No files found${scope}.`,
    );
  }
  if (action.action === 'read_file') {
    if (text.startsWith('File not found:')) return text;
    return `Read ${action.path} (${text.length.toLocaleString()} characters).`;
  }
  if (action.action === 'search_workspace' || action.action === 'search_semantic') {
    return truncateReasoningResult(
      `${lines.length} search result line(s) for “${action.query || ''}”:\n${text}`,
    );
  }
  return truncateReasoningResult(text);
};

export const isFailedValidationResult = (result: string): boolean => {
  try {
    return (JSON.parse(result) as { status?: string }).status === 'failed';
  } catch {
    return /\bfailed\b/i.test(result);
  }
};

export const formatValidationSummary = (rawResult: string): string => {
  if (typeof rawResult !== 'string') return String(rawResult ?? '');
  const trimmed = rawResult.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        status?: string;
        check?: string;
        diagnostics?: string | string[];
      };
      if (parsed && typeof parsed === 'object' && parsed.status) {
        const isPassed = parsed.status === 'passed';
        const statusText = isPassed
          ? 'Build validation passed successfully.'
          : `Build validation status: ${parsed.status}.`;
        const diagnostics = Array.isArray(parsed.diagnostics)
          ? parsed.diagnostics.join('\n')
          : typeof parsed.diagnostics === 'string'
            ? parsed.diagnostics
            : '';
        return diagnostics ? `${statusText}\n${diagnostics}` : statusText;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  return rawResult;
};

export const READ_ONLY_ACTIONS = new Set([
  'list_files',
  'search_workspace',
  'search_semantic',
  'read_file',
  'list_project_checks',
  'inspect_preview',
  'inspect_console_logs',
  'get_file_symbols',
  'manage_packages',
]);

export const NON_PRODUCTIVE_ACTIONS = new Set([
  ...READ_ONLY_ACTIONS,
  'validate',
  'run_project_check',
]);

export function applySearchReplaceBlock(existing: string, search: string, replace: string): string {
  if (!search || !existing.includes(search)) {
    throw new Error('Target search block not found in file content.');
  }
  return existing.replace(search, replace);
}
