import type { AgentAction, AgentEventHandler, FileMap } from '@/components/AI/types';
import type { ConsoleLogEntry } from './ConsoleLogInspector';
import { filterConsoleLogs, formatConsoleLogs } from './ConsoleLogInspector';
import type { AgentContextManager } from './ContextManager';
import { type PackageAction, handlePackageOperation } from './PackageManager';
import { extractFileSymbols, formatSymbolOutline } from './SymbolInspector';
import { visualPreviewInspectionFailure } from './VisualPreviewEvidence';

export type PreviewInspectLoopState = {
  inspectedPreview: boolean;
  previewInspectionAccepted: boolean;
  lastPreviewResult: string;
};

type InspectPreviewFn = (files: FileMap) => Promise<unknown>;

export function inspectConsoleLogs(action: AgentAction, files: FileMap): string {
  const query = action.query;
  const level = action.level;
  const rawLogs = (files['.console.log'] || '').split('\n').filter(Boolean);
  const parsedLogs: ConsoleLogEntry[] = rawLogs.map((line) => {
    const isErr = line.includes('[ERROR]');
    const isWarn = line.includes('[WARN]');
    return {
      level: isErr ? 'error' : isWarn ? 'warn' : 'log',
      message: line,
    };
  });
  return formatConsoleLogs(filterConsoleLogs(parsedLogs, { query, level }));
}

export function inspectFileSymbols(action: AgentAction, files: FileMap): string {
  const path = action.path || '';
  if (!Object.hasOwn(files, path)) throw new Error(`File not found: ${path}`);
  const fileContent = files[path];
  if (!fileContent) return `File not found: ${path}`;
  return formatSymbolOutline(extractFileSymbols(fileContent, path));
}

export function manageWorkspacePackages(
  action: AgentAction,
  files: FileMap,
): { result: string; updatedPackageJson?: string } {
  const rawAction = action.query || 'list';
  const pkgAction: PackageAction =
    rawAction === 'add' || rawAction === 'remove' ? rawAction : 'list';
  const opResult = handlePackageOperation(files, {
    action: pkgAction,
    packageName: action.packageName,
    version: action.version,
    isDev: Boolean(action.isDev),
  });
  return { result: JSON.stringify(opResult), updatedPackageJson: opResult.updatedPackageJson };
}

export function createInspectPreviewForLoop({
  state,
  files,
  inspectPreview,
  previewInspectionRequired,
  resolvedStyleProfile,
  applyCssModuleRecovery,
  context,
  onEvent,
  agentRole,
}: {
  state: PreviewInspectLoopState;
  files: FileMap;
  inspectPreview?: InspectPreviewFn;
  previewInspectionRequired: boolean;
  resolvedStyleProfile: unknown;
  applyCssModuleRecovery: (turn: number) => string[];
  context: AgentContextManager;
  onEvent: AgentEventHandler;
  agentRole?: string | null;
}): (turn: number) => Promise<string> {
  return async (turn: number): Promise<string> => {
    if (state.inspectedPreview && state.previewInspectionAccepted && state.lastPreviewResult) {
      return state.lastPreviewResult;
    }
    onEvent({ type: 'tool', turn, action: { action: 'inspect_preview' }, agentRole });
    let preview = inspectPreview
      ? await inspectPreview(files)
      : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
    state.inspectedPreview = true;
    let previewFailure = previewInspectionRequired ? visualPreviewInspectionFailure(preview) : null;
    if (previewFailure && resolvedStyleProfile && /style audit/i.test(previewFailure)) {
      const recovered = applyCssModuleRecovery(turn);
      if (recovered.length && inspectPreview) {
        preview = await inspectPreview(files);
        previewFailure = visualPreviewInspectionFailure(preview);
        context.record('style_audit_repair', {
          recovered,
          remaining: previewFailure || 'passed',
        });
      }
    }
    state.previewInspectionAccepted = !previewFailure;
    const evidence = previewFailure
      ? {
          ...(typeof preview === 'object' && preview ? preview : {}),
          visualReview: 'insufficient',
          diagnostics: previewFailure,
        }
      : preview;
    state.lastPreviewResult = JSON.stringify(evidence);
    context.record('preview', preview);
    return state.lastPreviewResult;
  };
}
