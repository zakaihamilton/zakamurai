import type { AgentEventHandler, FileMap, VerificationResult } from '@/components/AI/types';

import { AgentExecutionError } from './ActionLoopErrors';
import { type AgentContextManager, formatVerificationResult } from './ContextManager';
import type { AgentWorkspace } from './Workspace';

type ValidateWorkspace = (
  files: FileMap,
) => Promise<VerificationResult | string> | VerificationResult | string;

/** Validation failures caused by the browser/runtime must not trigger source rewrites. */
export const isInfrastructureValidationFailure = (verification: VerificationResult): boolean => {
  const diagnostics = `${verification.check || ''} ${verification.diagnostics || ''}`;
  return /failed to fetch dynamically imported module|failed to start (?:the )?container|(?:localhost|127\.0\.0\.1).*(?:fetch|connection)|err_connection_|service worker.*(?:failed|unavailable)|wasm.*(?:failed|unavailable)|network request failed/i.test(
    diagnostics,
  );
};

export type ActionLoopValidationState = {
  wroteSinceVerification: boolean;
  lastValidationFailed: boolean;
  lastValidationStatus: 'passed' | 'failed' | 'unavailable';
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
    const infrastructureFailure =
      verification.status === 'failed' && isInfrastructureValidationFailure(verification);
    const effectiveVerification = infrastructureFailure
      ? {
          ...verification,
          status: 'unavailable',
          diagnostics: `Validation could not run because the local preview/build runtime was unavailable. Do not rewrite source for this infrastructure failure. ${verification.diagnostics || ''}`,
        }
      : verification;
    const result = formatVerificationResult(effectiveVerification);
    context.record('verification', effectiveVerification);
    state.lastValidationStatus =
      effectiveVerification.status === 'passed'
        ? 'passed'
        : effectiveVerification.status === 'unavailable'
          ? 'unavailable'
          : 'failed';
    if (
      effectiveVerification.status === 'passed' ||
      effectiveVerification.status === 'unavailable'
    ) {
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
