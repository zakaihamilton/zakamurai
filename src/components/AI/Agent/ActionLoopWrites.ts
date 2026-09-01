import type { AgentAction, FileMap, TaskContract } from '@/components/AI/types';
import {
  validateAIChanges,
  validateComponentStyling,
  validateContentSyntax,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateDeclaredStateVariables,
  validateFileContentType,
  validateGeneratedPlaceholder,
  validateRequestFulfillment,
} from '../ChangeValidator';
import { assertTaskPathAllowed } from '../ReliabilityContracts';
import { isNewAppGenerationRequest } from './ActionLoopRecovery';
import {
  applySearchReplaceBlock,
  cssModuleImporters,
  ensureCoLocatedCssModule,
  missingCssModuleImports,
  missingCssModuleRules,
  normalizeGeneratedInteractiveSource,
  normalizeSideEffectCssSource,
  repairCssModuleStylesheet,
  rewriteInlineStylesToCssModule,
} from './ActionLoopUtils';
import type { ProjectStyleProfile } from './ProjectStyleProfile';

const SEARCH_REPLACE_BLOCK = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/;

export type PreparedWriteFile = {
  action: AgentAction;
  normalizedSideEffectCss: ReturnType<typeof normalizeSideEffectCssSource>;
  rewrittenInlineStyles: ReturnType<typeof rewriteInlineStylesToCssModule>;
  ensuredCssModule: ReturnType<typeof ensureCoLocatedCssModule>;
};

export function assertStagedFileContent({
  path,
  content,
  files,
  request,
  lightweightModel,
  skipMissingStylesheets = false,
}: {
  path: string;
  content: string;
  files: FileMap;
  request: string;
  lightweightModel: boolean;
  skipMissingStylesheets?: boolean;
}): void {
  const stylingError = validateComponentStyling(path, content);
  if (stylingError) throw new Error(stylingError);
  const contentTypeError = validateFileContentType(path, content);
  if (contentTypeError) throw new Error(contentTypeError);
  const placeholderError = validateGeneratedPlaceholder(path, content);
  if (placeholderError) throw new Error(placeholderError);
  if (lightweightModel) {
    const fulfillmentError = validateRequestFulfillment(path, content, request);
    if (fulfillmentError) throw new Error(fulfillmentError);
  }
  const cssModuleError = validateCssModuleUsage(path, content);
  if (cssModuleError) throw new Error(cssModuleError);
  const missingStylesheets = missingCssModuleImports(path, content, files);
  if (missingStylesheets.length && !skipMissingStylesheets) {
    throw new Error(
      `Missing CSS Module import${missingStylesheets.length > 1 ? 's' : ''}: ${missingStylesheets.join(', ')}.`,
    );
  }
  const cssSafetyError = validateCssContentSafety(path, content);
  if (cssSafetyError) throw new Error(cssSafetyError);
  const stateVarError = validateDeclaredStateVariables(path, content);
  if (stateVarError) throw new Error(stateVarError);
  const syntaxError = validateContentSyntax(path, content);
  if (syntaxError) throw new Error(syntaxError);
}

export function prepareWriteFileAction({
  action,
  files,
  request,
  styleProfile,
  lightweightModel,
}: {
  action: AgentAction;
  files: FileMap;
  request: string;
  styleProfile: ProjectStyleProfile | null | undefined;
  lightweightModel: boolean;
}): PreparedWriteFile {
  let next = action;
  const normalizedSideEffectCss = /\.(jsx|tsx)$/i.test(next.path || '')
    ? normalizeSideEffectCssSource(next.path || '', next.content || '')
    : null;
  if (normalizedSideEffectCss) {
    next = { ...next, content: normalizedSideEffectCss.content };
  }
  const rewrittenInlineStyles = /\.(jsx|tsx)$/i.test(next.path || '')
    ? rewriteInlineStylesToCssModule(next.path || '', next.content || '')
    : null;
  if (rewrittenInlineStyles) {
    next = { ...next, content: rewrittenInlineStyles.content };
  }
  const ensuredCssModule =
    !rewrittenInlineStyles && /\.(jsx|tsx)$/i.test(next.path || '')
      ? ensureCoLocatedCssModule(next.path || '', next.content || '', styleProfile || undefined)
      : null;
  if (ensuredCssModule) {
    next = { ...next, content: ensuredCssModule.content };
  }
  if (isNewAppGenerationRequest(request) && /\.(?:jsx|tsx)$/i.test(next.path || '')) {
    next = {
      ...next,
      content: normalizeGeneratedInteractiveSource(next.content || ''),
    };
  }
  assertStagedFileContent({
    path: next.path || '',
    content: next.content || '',
    files,
    request,
    lightweightModel,
    skipMissingStylesheets: Boolean(
      normalizedSideEffectCss || rewrittenInlineStyles || ensuredCssModule,
    ),
  });
  if (/\.module\.css$/i.test(next.path || '')) {
    next = {
      ...next,
      content: repairCssModuleStylesheet(
        next.path || '',
        next.content || '',
        files,
        styleProfile || undefined,
        { responsive: isNewAppGenerationRequest(request) },
      ),
    };
  }
  const remainingMissingRules = missingCssModuleRules(next.path || '', next.content || '', files);
  if (remainingMissingRules.length) {
    throw new Error(
      `CSS Module ${next.path} is missing rules required by its importing component: ${remainingMissingRules.join(', ')}.`,
    );
  }
  return { action: next, normalizedSideEffectCss, rewrittenInlineStyles, ensuredCssModule };
}

export function applyReplaceFileContent({
  action,
  files,
  request,
  lightweightModel,
  taskContract,
}: {
  action: AgentAction;
  files: FileMap;
  request: string;
  lightweightModel: boolean;
  taskContract: TaskContract;
}): { path: string; content: string } {
  const path = action.path || '';
  assertTaskPathAllowed(taskContract, path);
  if (!Object.hasOwn(files, path)) {
    throw new Error(`File not found: ${path}. Cannot perform replace_file_content.`);
  }
  let search = action.search || '';
  let replace = action.replace || '';
  if (!search && action.content) {
    const match = action.content.match(SEARCH_REPLACE_BLOCK);
    if (match) {
      search = match[1];
      replace = match[2];
    }
  }
  if (!search) {
    throw new Error('replace_file_content action requires search block or SEARCH/REPLACE pattern.');
  }
  const newContent = applySearchReplaceBlock(files[path], search, replace);
  const nextFiles = { ...files, [path]: newContent };
  assertStagedFileContent({
    path,
    content: newContent,
    files: nextFiles,
    request,
    lightweightModel,
  });
  const validation = validateAIChanges([{ path, after: newContent }]);
  if (validation.rejected.length > 0) {
    throw new Error(validation.rejected[0]);
  }
  return { path, content: newContent };
}

export function assertDeletableFile(path: string, files: FileMap): void {
  const importers = cssModuleImporters(path, files);
  if (importers.length) {
    throw new Error(
      `Cannot delete CSS Module ${path} because it is imported by ${importers.join(', ')}. Update or delete the importing component files first.`,
    );
  }
}
