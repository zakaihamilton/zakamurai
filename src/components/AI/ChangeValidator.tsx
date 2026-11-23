import type { AgentChange, EsbuildTransform, ValidatedAIChanges } from '@/components/AI/types';
import { hasValidAiChangeContent, isProjectRelativePath } from '@/contracts/ai';
import {
  validateForbiddenStateLibraryUsage,
  validateGeneratedPlaceholder,
} from './ChangeValidatorSourceShape';
import {
  validateComponentStyling,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateFileContentType,
} from './ChangeValidatorStyles';
import { validateContentSyntax } from './ChangeValidatorSyntax';
import {
  validateDeclaredFunctionCalls,
  validateDeclaredStateVariables,
} from './DeclaredFunctionValidator';

export {
  validateRequestFulfillment,
  workspaceFulfillsInteractiveRequest,
} from './ChangeValidatorFulfillment';
export {
  validateForbiddenStateLibraryUsage,
  validateGeneratedPlaceholder,
  validateGeneratedSourceShape,
} from './ChangeValidatorSourceShape';
export {
  validateComponentStyling,
  validateCssContentSafety,
  validateCssModuleRelationships,
  validateCssModuleUsage,
  validateFileContentType,
  validateInteractiveStyles,
} from './ChangeValidatorStyles';
export { validateContentSyntax } from './ChangeValidatorSyntax';
export {
  validateDeclaredFunctionCalls,
  validateDeclaredStateVariables,
} from './DeclaredFunctionValidator';

/** Shared safety checks for AI-proposed workspace changes. */
export function validateProjectPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return 'A file path is required.';
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Path must be project-relative: ${path}`;
  }
  if (!isProjectRelativePath(path)) {
    return `Unsafe project path: ${path}`;
  }
  return null;
}

/** Async syntax validation with esbuild transform attempt if initialized. */
export async function validateContentSyntaxAsync(
  path: string,
  content: string,
  esbuildTransform: EsbuildTransform | null = null,
): Promise<string | null> {
  const syncError = validateContentSyntax(path, content);
  if (syncError) return syncError;

  if (typeof esbuildTransform === 'function') {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
      try {
        const loader = ext === 'tsx' ? 'tsx' : ext === 'ts' ? 'ts' : ext === 'jsx' ? 'jsx' : 'js';
        await esbuildTransform(content, { loader });
      } catch (err) {
        const error = err as Error;
        return `Syntax error in ${path}: ${error.message || String(err)}`;
      }
    }
  }

  return null;
}

type ChangeValidationDetail = NonNullable<ValidatedAIChanges['details']>[number];

type SingleChangeSyncResult =
  | { ok: true; path: string; content: unknown }
  | { ok: false; detail: ChangeValidationDetail };

const SYNC_CONTENT_CHECKS: Array<
  readonly [(path: string, content: string) => string | null, string]
> = [
  [validateGeneratedPlaceholder, 'content'],
  [validateForbiddenStateLibraryUsage, 'architecture'],
  [validateComponentStyling, 'styling'],
  [validateCssModuleUsage, 'styling'],
  [validateFileContentType, 'content'],
  [validateCssContentSafety, 'content'],
  [validateDeclaredStateVariables, 'syntax'],
  [validateDeclaredFunctionCalls, 'syntax'],
];

/** Runs all synchronous validation checks for a single proposed change. */
export function validateSingleChangeSync(
  change: AgentChange,
  seen: Set<string>,
  options: { includeSyntaxCheck?: boolean } = {},
): SingleChangeSyncResult {
  const path = change?.path ?? change?.filePath;
  const pathError = validateProjectPath(path);
  if (pathError) {
    return { ok: false, detail: { path: String(path), error: pathError, type: 'path' } };
  }
  const normalizedPath = path as string;
  if (seen.has(normalizedPath)) {
    const conflictErr = `Conflicting operations target ${normalizedPath}.`;
    return { ok: false, detail: { path: normalizedPath, error: conflictErr, type: 'conflict' } };
  }

  const content = change.content ?? change.after;
  if (!hasValidAiChangeContent(change)) {
    const contentErr = `Invalid change content for ${normalizedPath}.`;
    return { ok: false, detail: { path: normalizedPath, error: contentErr, type: 'content' } };
  }

  if (typeof content === 'string') {
    const checks = options.includeSyntaxCheck
      ? [...SYNC_CONTENT_CHECKS, [validateContentSyntax, 'syntax'] as const]
      : SYNC_CONTENT_CHECKS;
    for (const [check, type] of checks) {
      const error = check(normalizedPath, content);
      if (error) {
        return {
          ok: false,
          detail: { path: normalizedPath, error, type, failedContent: content },
        };
      }
    }
  }

  return { ok: true, path: normalizedPath, content };
}

/**
 * Async validation for structured AI changes including esbuild transform checks.
 */
export async function validateAIChangesAsync(
  changes: AgentChange[],
  esbuildTransform: EsbuildTransform | null = null,
): Promise<ValidatedAIChanges> {
  if (!Array.isArray(changes)) {
    return { accepted: [], rejected: ['Changes must be an array.'], details: [] };
  }
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  const details: NonNullable<ValidatedAIChanges['details']> = [];

  for (const change of changes) {
    const syncResult = validateSingleChangeSync(change, seen, { includeSyntaxCheck: false });
    if (!syncResult.ok) {
      rejected.push(syncResult.detail.error);
      details.push(syncResult.detail);
      continue;
    }

    if (typeof syncResult.content === 'string') {
      const syntaxError = await validateContentSyntaxAsync(
        syncResult.path,
        syncResult.content,
        esbuildTransform,
      );
      if (syntaxError) {
        rejected.push(syntaxError);
        details.push({
          path: syncResult.path,
          error: syntaxError,
          type: 'syntax',
          failedContent: syncResult.content,
        });
        continue;
      }
    }

    seen.add(syncResult.path);
    accepted.push(change);
  }

  return { accepted, rejected, details };
}

/**
 * Returns structured accepted/rejected operations so callers can preserve the
 * staged review flow while explaining why unsafe proposals were ignored.
 */
export function validateAIChanges(changes: AgentChange[]): ValidatedAIChanges {
  if (!Array.isArray(changes)) return { accepted: [], rejected: ['Changes must be an array.'] };
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  for (const change of changes) {
    const syncResult = validateSingleChangeSync(change, seen, { includeSyntaxCheck: true });
    if (!syncResult.ok) {
      rejected.push(syncResult.detail.error);
      continue;
    }
    seen.add(syncResult.path);
    accepted.push(change);
  }
  return { accepted, rejected };
}

/** Validates component modularity and CSS module co-location across staged files. */
export function validateWorkspaceModularity(files: Record<string, string>): {
  passed: boolean;
  errors: string[];
} {
  const { checkComponentModularity } = require('./Agent/ProjectChecks');
  return checkComponentModularity(files);
}
