import * as smallModel from './ActionLoopSmallModel';
import { type ProjectStyleProfile, formatProjectStyleContract } from './ProjectStyleProfile';

export const CHANGE_REQUEST_PATTERN =
  /\b(?:add|build|change|create|delete|design|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update)\b/i;

export type BuildUserRequestOptions = {
  request: string;
  scope?: string;
  activeFile?: string | null;
  selectedLines?: number[];
  priorContext?: string;
};

export const buildUserRequest = ({
  request,
  scope,
  activeFile,
  selectedLines = [],
  priorContext,
}: BuildUserRequestOptions): string => {
  const scopeBlock =
    scope === 'project'
      ? `Request: ${request}\nScope: whole project\n${priorContext ? 'Use the supplied workspace context; do not repeat the initial inventory.' : 'Start by inspecting the entire workspace. Do not assume any file is the primary target.'}`
      : `Request: ${request}\nScope: current file\nActive file: ${activeFile || 'none'}\nSelected lines: ${selectedLines.join(', ') || 'none'}\n${priorContext ? 'Use the supplied workspace context; do not repeat the initial inventory.' : 'Start by inspecting the workspace.'}`;
  const implementationGuidance = CHANGE_REQUEST_PATTERN.test(request)
    ? priorContext
      ? '\nImplementation requirement: workspace context has already been collected. Make a write_file or delete_file edit now before using validate, inspect_preview, run_project_check, or finish. Do not repeat the workspace inspection.'
      : '\nImplementation requirement: this is a change request. Make at least one write_file or delete_file edit before using validate, inspect_preview, run_project_check, or finish. After one brief inspection, implement the request instead of continuing to inspect.'
    : '';
  const requestBlock = `${scopeBlock}${implementationGuidance}`;
  if (!priorContext) return requestBlock;
  return `${requestBlock}\n\nPrior conversation context:\n${priorContext}`;
};

const extractConversationalPrior = (priorContext: string): string | null => {
  const conversational = priorContext
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter(
      (block) =>
        !/^\[(?:list_files|read_file|search_workspace|search_semantic|prior)(?:\s|\])/i.test(
          block,
        ) && !/^---\s+\S/.test(block),
    );
  if (!conversational.length) return null;
  return conversational.join('\n\n').slice(0, 1200);
};

const extractManagerSelectedPrior = (
  priorContext: string,
  includedPaths: string[],
): string | null => {
  const included = new Set(includedPaths);
  const selected = priorContext
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => /^\[(?:read_file|search_workspace|search_semantic)(?:\s|\])/i.test(block))
    .filter((block) => {
      const input = block.match(/^\[[^\s\]]+\s+(\{[^\]]+\})\]/)?.[1];
      if (!input) return true;
      try {
        const path = JSON.parse(input)?.path;
        return typeof path !== 'string' || !included.has(path);
      } catch {
        return true;
      }
    })
    .slice(0, 3)
    .map((block) => block.slice(0, 1400));
  return selected.length ? selected.join('\n\n').slice(0, 3200) : null;
};

const formatProjectCodeContract = (files: Record<string, string>, targetPath: string): string => {
  const sources = Object.entries(files).filter(([path]) => /\.(?:jsx|tsx)$/i.test(path));
  const defaultExports = sources.filter(([, content]) =>
    /\bexport\s+default\b/.test(content),
  ).length;
  const namedExports = sources.filter(([, content]) =>
    /\bexport\s+(?:const|function|class)\b/.test(content),
  ).length;
  const imports = sources.flatMap(([, content]) => [
    ...content.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g),
  ]);
  const explicitExtensions = imports.filter((match) => /\.[a-z]+$/i.test(match[1])).length;
  const extensionless = imports.length - explicitExtensions;
  return [
    /\.tsx$/i.test(targetPath) ? 'TypeScript/TSX' : 'JavaScript/JSX',
    defaultExports >= namedExports ? 'default component exports' : 'named component exports',
    extensionless >= explicitExtensions
      ? 'extensionless relative imports'
      : 'explicit import extensions',
    'default-import co-located CSS Modules as styles',
  ].join('; ');
};

export const SMALL_MODEL_CONTEXT_READY_CHAR_BUDGET = 4100;

const joinPromptSections = (sections: Array<string | null | undefined>): string =>
  sections.filter((section): section is string => Boolean(section)).join('\n\n');

export const buildContextReadyUserRequest = ({
  request,
  targetPath,
  files,
  priorContext = '',
  lightweight = false,
  styleProfile,
  responsiveGeneration = false,
  hostGuidance = null,
  includeProductContract = false,
}: {
  request: string;
  targetPath: string;
  files: Record<string, string>;
  priorContext?: string;
  lightweight?: boolean;
  styleProfile?: ProjectStyleProfile;
  responsiveGeneration?: boolean;
  hostGuidance?: string | null;
  includeProductContract?: boolean;
}): string => {
  const stylesheetPath = targetPath.replace(/\.(jsx|tsx)$/i, '.module.css');
  const contextPaths = [targetPath, stylesheetPath, 'package.json'].filter(
    (path, index, paths) => Object.hasOwn(files, path) && paths.indexOf(path) === index,
  );
  const siblingFileChars = lightweight ? 2400 : 8000;
  const clipText = (content: string, maxChars: number) =>
    content.length <= maxChars ? content : `${content.slice(0, maxChars)}\n…[context truncated]`;
  const targetFileContent = Object.hasOwn(files, targetPath) ? String(files[targetPath] || '') : '';
  const targetLineCount = targetFileContent ? targetFileContent.split('\n').length : 0;
  const targetFileBlock = Object.hasOwn(files, targetPath)
    ? `--- ${targetPath} ---\n${files[targetPath]}`
    : null;
  const surgicalEditHint =
    !lightweight && targetLineCount > 120
      ? `Note: ${targetPath} has ${targetLineCount} lines. Preserve unchanged functions and imports verbatim; modify only the functions or JSX elements required by the request.`
      : null;
  const siblingPaths = contextPaths.filter((path) => path !== targetPath);
  const formatSiblings = (maxChars: number) =>
    siblingPaths.length
      ? siblingPaths
          .map((path) => `--- ${path} ---\n${clipText(files[path], maxChars)}`)
          .join('\n\n')
      : null;
  const targetDirectory = targetPath.split('/').slice(0, -1).join('/');
  const reference = Object.keys(files)
    .filter(
      (path) =>
        /\.(?:jsx|tsx)$/i.test(path) &&
        path !== targetPath &&
        Object.hasOwn(files, path.replace(/\.(jsx|tsx)$/i, '.module.css')),
    )
    .sort((left, right) => {
      const leftNearby = left.startsWith(`${targetDirectory}/`) ? 1 : 0;
      const rightNearby = right.startsWith(`${targetDirectory}/`) ? 1 : 0;
      return rightNearby - leftNearby || left.localeCompare(right);
    })[0];
  const formatReference = (maxChars: number) =>
    reference && !lightweight
      ? [reference, reference.replace(/\.(jsx|tsx)$/i, '.module.css')]
          .map((path) => `--- Style reference: ${path} ---\n${clipText(files[path], maxChars)}`)
          .join('\n\n')
      : null;
  let conversation = extractConversationalPrior(priorContext);
  const managerContext = extractManagerSelectedPrior(priorContext, contextPaths);
  let manager =
    managerContext && lightweight && managerContext.length > 900
      ? clipText(managerContext, 900)
      : managerContext;
  let siblingContext = formatSiblings(siblingFileChars);
  let referenceContext = formatReference(1400);
  let guidance = smallModel.generationGuidanceForRequest(request, {
    interactiveContract: lightweight || includeProductContract,
    targetPath,
    lightweight,
  });
  let styleContract = styleProfile
    ? `Project generation contract:\n${formatProjectStyleContract(styleProfile, { responsive: responsiveGeneration })}`
    : null;
  const nextStep = lightweight
    ? `Your next response must be ONLY a labelled code fence with the complete source for ${targetPath}. Do not return JSON.`
    : `Your next response must be exactly one write_file action for ${targetPath}.`;
  const assemble = () =>
    joinPromptSections([
      `Request: ${request}`,
      ...guidance,
      hostGuidance,
      conversation ? `Prior conversation:\n${conversation}` : null,
      manager ? `Manager-selected context:\n${manager}` : null,
      'The workspace has already been inspected. Do not list, search, or read files.',
      nextStep,
      surgicalEditHint,
      `Project code contract: ${formatProjectCodeContract(files, targetPath)}.`,
      styleContract,
      'Use the supplied files as context and return the complete implementation now.',
      targetFileBlock || (siblingContext ? null : 'No relevant source file exists yet.'),
      siblingContext,
      referenceContext,
    ]);
  if (lightweight || includeProductContract) {
    const shrinkSteps = [
      () => {
        manager = manager ? clipText(manager, 280) : null;
      },
      () => {
        manager = null;
      },
      () => {
        referenceContext = referenceContext ? clipText(referenceContext, 400) : null;
      },
      () => {
        referenceContext = null;
      },
      () => {
        siblingContext = formatSiblings(600);
      },
      () => {
        siblingContext = null;
      },
      () => {
        conversation = null;
      },
      () => {
        styleContract = styleProfile
          ? `Project generation contract:\n${formatProjectStyleContract(styleProfile, { responsive: false })}`
          : null;
      },
      () => {
        styleContract = null;
      },
      () => {
        if (guidance.length > 1) guidance = guidance.slice(0, 1);
      },
      () => {
        if (guidance[0]) guidance = [clipText(guidance[0], 480)];
      },
    ];
    for (const shrink of shrinkSteps) {
      if (assemble().length <= SMALL_MODEL_CONTEXT_READY_CHAR_BUDGET) break;
      shrink();
    }
  }
  return assemble();
};
