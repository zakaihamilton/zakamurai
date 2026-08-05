import type { AgentEventHandler, FileMap, VerificationResult } from '@/components/AI/types';

import { AgentExecutionError } from './ActionLoopErrors';
import { type AgentContextManager, formatVerificationResult } from './ContextManager';
import type { AgentWorkspace } from './Workspace';

type ValidateWorkspace = (
  files: FileMap,
) => Promise<VerificationResult | string> | VerificationResult | string;

export type ActionLoopValidationState = {
  wroteSinceVerification: boolean;
  lastValidationFailed: boolean;
  repairAttempts: number;
};

export const createValidationRunner = ({
  workspace,
  validate,
  onEvent,
  agentRole,
  context,
  state,
  validationRepairLimit,
}: {
  workspace: AgentWorkspace;
  validate?: ValidateWorkspace;
  onEvent: AgentEventHandler;
  agentRole?: string | null;
  context: AgentContextManager;
  state: ActionLoopValidationState;
  validationRepairLimit: number;
}) => {
  return async (turn: number, provenance: 'model' | 'recovery' = 'recovery'): Promise<string> => {
    // Browser builds cannot execute Vite config files; stage their removal so validate can use
    // supported defaults instead of burning repair attempts on an unfixable environment.
    const unsupportedBrowserConfigs = [
      'vite.config.js',
      'vite.config.mjs',
      'vite.config.cjs',
      'vite.config.ts',
      'vite.config.mts',
    ];
    const removedConfigs = unsupportedBrowserConfigs.filter((path) =>
      Object.hasOwn(workspace.files, path),
    );
    for (const path of removedConfigs) {
      workspace.delete(path);
      onEvent({
        type: 'tool',
        turn,
        action: { action: 'delete_file', path },
        agentRole,
        provenance: 'recovery',
      });
    }
    onEvent({
      type: 'tool',
      turn,
      action: { action: 'validate' },
      agentRole,
      provenance,
    });
    const rawVerification = validate
      ? await validate(workspace.files)
      : { status: 'unavailable', check: 'build', diagnostics: 'Validation is unavailable.' };
    const verification: VerificationResult =
      typeof rawVerification === 'string'
        ? {
            status: /\b(passed|success|ok)\b/i.test(rawVerification) ? 'passed' : 'failed',
            check: 'build',
            diagnostics: rawVerification,
          }
        : rawVerification;
    const result = formatVerificationResult(verification);
    context.record('verification', verification);
    if (verification.status === 'passed' || verification.status === 'unavailable') {
      state.wroteSinceVerification = false;
      state.lastValidationFailed = false;
      state.repairAttempts = 0;
    } else {
      state.lastValidationFailed = true;
      if (++state.repairAttempts >= validationRepairLimit) {
        throw new AgentExecutionError(
          `Validation failed after ${validationRepairLimit} repair attempts. Last result: ${result}. Staged changes were preserved for review.`,
          workspace.changes(),
        );
      }
    }
    return result;
  };
};
