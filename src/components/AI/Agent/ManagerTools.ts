import type {
  FileMap,
  ManagerToolName,
  ManagerToolOptions,
  SemanticSearchResult,
  VerificationResult,
  WorkspaceIndex,
} from '@/components/AI/types';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { AgentWorkspace } from './Workspace';

export type ManagerToolContext = ManagerToolOptions & {
  workspace: AgentWorkspace;
  workspaceIndex?: WorkspaceIndex | null;
};

export type ManagerToolCall = {
  tool: ManagerToolName;
  input?: Record<string, unknown>;
};

export type ManagerToolResult = {
  tool: ManagerToolName;
  value: unknown;
  text: string;
};

const clip = (value: unknown, max = 12000): string => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
};

const asString = (input: Record<string, unknown> | undefined, key: string): string =>
  typeof input?.[key] === 'string' ? String(input[key]) : '';

const asNumber = (
  input: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number =>
  typeof input?.[key] === 'number' && Number.isFinite(input[key]) ? Number(input[key]) : fallback;

function checkNameFromRequest(request: string, checks: string[]): string | null {
  const normalized = request.toLowerCase();
  return checks.find((check) => normalized.includes(check.toLowerCase())) || checks[0] || null;
}

export async function executeManagerTool(
  call: ManagerToolCall,
  context: ManagerToolContext,
): Promise<ManagerToolResult> {
  const input = call.input;
  let value: unknown;
  switch (call.tool) {
    case 'list_files':
      value = context.workspace.list(asString(input, 'query'));
      break;
    case 'read_file':
      value = context.workspace.read(asString(input, 'path'));
      break;
    case 'search_workspace':
      value = await context.workspace.search(asString(input, 'query'), asString(input, 'glob'));
      break;
    case 'search_semantic':
      value = await context.workspace.semanticSearch(
        asString(input, 'query'),
        context.retrieveContext,
        asNumber(input, 'k', 5),
      );
      break;
    case 'list_project_checks':
      value = listProjectChecks(context.workspace.files);
      break;
    case 'run_project_check': {
      const checks = listProjectChecks(context.workspace.files);
      const requested = asString(input, 'check');
      const check = requested || checkNameFromRequest(asString(input, 'request'), checks);
      if (!check)
        value = { status: 'unavailable', diagnostics: 'No eligible project check was found.' };
      else {
        value = await runProjectCheck({
          check,
          files: context.workspace.files,
          run: context.runProjectCheck
            ? (name: string, files: FileMap) =>
                context.runProjectCheck?.(name, files) || Promise.resolve('')
            : null,
        });
      }
      break;
    }
    case 'validate': {
      const result = context.validate
        ? await context.validate(context.workspace.files)
        : ({
            status: 'unavailable',
            diagnostics: 'Validation is unavailable.',
          } satisfies VerificationResult);
      value = result;
      break;
    }
    case 'inspect_preview':
      value = context.inspectPreview
        ? await context.inspectPreview(context.workspace.files)
        : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
      break;
    default:
      throw new Error(`Unsupported manager tool: ${String(call.tool)}`);
  }

  return {
    tool: call.tool,
    value,
    text: clip(typeof value === 'string' ? value : JSON.stringify(value)),
  };
}

export function createManagerToolContext(
  files: FileMap,
  workspaceIndex: WorkspaceIndex | null | undefined,
  options: ManagerToolOptions,
): ManagerToolContext {
  return { ...options, workspace: new AgentWorkspace(files, workspaceIndex), workspaceIndex };
}

export function formatContextResults(results: ManagerToolResult[]): string {
  return results.map((result) => `[${result.tool}]\n${result.text}`).join('\n\n');
}

export type { SemanticSearchResult };
