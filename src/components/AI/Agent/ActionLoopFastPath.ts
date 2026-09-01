import type { AgentEventHandler, RunAgentResult } from '@/components/AI/types';

import { workspaceFulfillsInteractiveRequest } from '../ChangeValidator';
import { AgentExecutionError } from './ActionLoopErrors';
import type { PreviewInspectLoopState } from './ActionLoopInspect';
import { normalizeFinishSummary, wireNewComponentIntoScratchEntry } from './ActionLoopRecovery';
import { isNewAppGenerationRequest } from './ActionLoopSmallModel';
import { isFailedValidationResult, missingCssModuleImports } from './ActionLoopUtils';
import type { ActionLoopValidationState } from './ActionLoopValidation';
import type { AgentContextManager } from './ContextManager';
import { repairProjectStyleRelationships } from './ProjectStyleProfile';
import type { AgentWorkspace } from './Workspace';

type AutoFinishContextReadyWriteOptions = {
  request: string;
  workspace: AgentWorkspace;
  lightweightTargetPath: string;
  visualMode: boolean;
  previewInspectionRequired: boolean;
  previewInspectState: PreviewInspectLoopState;
  applyCssModuleRecovery: (turn: number) => string[];
  inspectPreviewForLoop: (turn: number) => Promise<string>;
  hasValidation: boolean;
  runValidation: (turn: number) => Promise<string>;
  validationState: ActionLoopValidationState;
  onEvent: AgentEventHandler;
  agentRole?: string | null;
  context: AgentContextManager;
};

export const createAutoFinishContextReadyWrite = ({
  request,
  workspace,
  lightweightTargetPath,
  visualMode,
  previewInspectionRequired,
  previewInspectState,
  applyCssModuleRecovery,
  inspectPreviewForLoop,
  hasValidation,
  runValidation,
  validationState,
  onEvent,
  agentRole,
  context,
}: AutoFinishContextReadyWriteOptions) => {
  return async (turn: number): Promise<RunAgentResult | null> => {
    try {
      applyCssModuleRecovery(turn);
      const fulfillmentError = isNewAppGenerationRequest(request)
        ? workspaceFulfillsInteractiveRequest(workspace.files, request)
        : null;
      if (fulfillmentError) throw new Error(fulfillmentError);

      const styleRepair = repairProjectStyleRelationships({
        files: workspace.files,
        targetPath: lightweightTargetPath,
        requireCoLocated: visualMode,
        repair: () => applyCssModuleRecovery(turn),
      });
      if (styleRepair?.remaining.length) {
        throw new Error(`CSS Module contract is incomplete: ${styleRepair.remaining.join(' ')}`);
      }

      const missingStylesheets = [
        ...new Set(
          Object.entries(workspace.files).flatMap(([path, content]) =>
            /\.(?:jsx|tsx)$/i.test(path)
              ? missingCssModuleImports(path, content, workspace.files)
              : [],
          ),
        ),
      ];
      if (missingStylesheets.length) {
        throw new Error(`Missing CSS Module files: ${missingStylesheets.join(', ')}.`);
      }

      if (
        previewInspectionRequired &&
        (!previewInspectState.inspectedPreview || !previewInspectState.previewInspectionAccepted)
      ) {
        await inspectPreviewForLoop(turn);
        if (!previewInspectState.previewInspectionAccepted) {
          throw new Error(
            previewInspectState.lastPreviewResult ||
              'Preview inspection did not accept the staged application.',
          );
        }
      }

      const validationResult = hasValidation
        ? await runValidation(turn)
        : 'Deterministic request-fulfillment checks passed.';
      if (isFailedValidationResult(validationResult)) throw new Error(validationResult);

      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const changes = workspace.changes();
      const summary = normalizeFinishSummary({
        request,
        changeCount: changes.length,
        wiredEntry,
        validationStatus: validationState.lastValidationStatus,
      });
      onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
      context.record(hasValidation ? 'validation' : 'fulfillment', validationResult);
      return { changes, files: workspace.files, summary, events: turn, workspace };
    } catch (error) {
      if (error instanceof AgentExecutionError) throw error;
      return null;
    }
  };
};
