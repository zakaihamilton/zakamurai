import type { AgentAction, AgentEventHandler, FileMap, WebLLMMessage } from '@/components/AI/types';
import { getWebLLMStore } from '../WebLLMState';
import {
  INTERACTIVE_GENERATION_GUIDANCE,
  generationGuidanceForRequest,
} from './ActionLoopSmallModel';
import { observation } from './ActionLoopUtils';
import type { AgentContextManager } from './ContextManager';
import { type ProjectStyleProfile, formatProjectStyleContract } from './ProjectStyleProfile';
import type { AgentWorkspace } from './Workspace';

export const AGENT_CONTEXT_WINDOW_SIZE = 4096;
export const AGENT_GENERATION_TOKENS = 2000;
export const AGENT_RECOVERY_TOKENS = 2600;
export const LIGHTWEIGHT_AGENT_GENERATION_TOKENS = 2000;
export const LIGHTWEIGHT_AGENT_RECOVERY_TOKENS = 2600;

export const loadAskWebLLM = async () => (await import('../WebLLMAPI')).askWebLLM;

export const APP_ENTRY_PATHS = new Set([
  'src/App.jsx',
  'src/App.tsx',
  'src/main.jsx',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.tsx',
]);

export const recoveryWritePath = (
  files: Record<string, string>,
  activeFile?: string | null,
): string | null => {
  if (activeFile && Object.hasOwn(files, activeFile) && /\.(?:[jt]sx?)$/i.test(activeFile))
    return activeFile;
  return (
    [...APP_ENTRY_PATHS].find((path) => Object.hasOwn(files, path)) ||
    Object.keys(files).find((path) => /\.(?:[jt]sx?)$/i.test(path)) ||
    null
  );
};

export const recoverDeferredSource = ({
  source,
  files,
  request,
  lightweight,
  turn,
  action,
  agentRole,
  onEvent,
  fulfills,
}: {
  source: { path: string; content: string };
  files: FileMap;
  request: string;
  lightweight: boolean;
  turn: number;
  action: AgentAction;
  agentRole: string | null;
  onEvent: AgentEventHandler;
  fulfills: (files: FileMap, request: string) => string | null;
}): { path: string; content: string; diagnostic: string } | null => {
  if (!lightweight) return null;
  const diagnostic = fulfills(files, request);
  if (!diagnostic) return null;
  onEvent({
    type: 'observation',
    turn,
    action,
    error: true,
    message: `${diagnostic} The queued source was staged for context, but it is not accepted as complete. Return a corrected write_file action for ${source.path} with the complete implementation.`,
    agentRole,
  });
  return { path: source.path, content: files[source.path] || source.content, diagnostic };
};

export const newlyCreatedComponentsNeedEntryWiring = (workspace: AgentWorkspace): boolean =>
  workspace
    .changes()
    .some(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        ![...APP_ENTRY_PATHS].some((path) => workspace.original[path] !== workspace.files[path]),
    );

export const getModelDownloadProgress = (modelId: string): string | null => {
  const store = getWebLLMStore();
  const engines = store?.engines || {};
  const modelIds = [modelId, store?.activeModelId].filter(
    (id, index, ids): id is string => typeof id === 'string' && ids.indexOf(id) === index,
  );
  const downloadingEngine = modelIds
    .map((id) => engines[id])
    .find((engine) => engine?.status === 'downloading');
  if (!downloadingEngine) return null;
  return downloadingEngine.progressText
    ? `the model is downloading — ${downloadingEngine.progressText}`
    : 'the model is downloading; waiting for model files';
};

export const recordTruncatedModelOutput = ({
  turn,
  target,
  agentRole,
  messages,
  context,
  onEvent,
}: {
  turn: number;
  target: string;
  agentRole: string | null;
  messages: WebLLMMessage[];
  context: AgentContextManager;
  onEvent: AgentEventHandler;
}): void => {
  const message = `The previous model response reached the output token limit before producing a complete file. The response was not staged. Return only one closed source fence containing the complete source for ${target}. Do not include ReactDOM bootstrap code, CSS declarations, a JavaScript styles object, another file, or prose.`;
  messages.push({ role: 'user', content: observation('model_output', false, message) });
  context.record('truncated_model_output', message);
  onEvent({
    type: 'observation',
    turn,
    action: { action: 'write_file', path: target },
    error: true,
    message,
    agentRole,
  });
};

export const wireNewComponentIntoScratchEntry = (workspace: AgentWorkspace): string | null => {
  const entryPath = [...APP_ENTRY_PATHS].find((path) => isScratchEntry(workspace.original[path]));
  if (!entryPath || workspace.original[entryPath] !== workspace.files[entryPath]) return null;

  const component = workspace
    .changes()
    .find(
      (change) =>
        change.before === undefined &&
        /^src\/components\/[^/]+\.(?:jsx|tsx)$/i.test(change.path) &&
        /\bexport\s+default\b/.test(change.after || ''),
    );
  if (!component?.after) return null;

  const componentName = component.path
    .split('/')
    .pop()
    ?.replace(/\.(?:jsx|tsx)$/i, '')
    .replace(/[^A-Za-z0-9_$]/g, '');
  if (!componentName || !/^[A-Za-z_$]/.test(componentName)) return null;

  const componentSpecifier = `./${component.path
    .split('/')
    .slice(1)
    .join('/')
    .replace(/\.(?:jsx|tsx)$/i, '')}`;
  workspace.write(
    entryPath,
    `import ${componentName} from "${componentSpecifier}";\n\nexport default function App() {\n  return <${componentName} />;\n}\n`,
  );
  return entryPath;
};

export const CHANGE_REQUEST_PATTERN =
  /\b(?:add|build|change|create|delete|design|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update)\b/i;

export const createAutoFinishSummary =
  (request: string) =>
  (
    reason: 'validate' | 'fulfillment' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
    wiredEntry: string | null,
    validationStatus: 'passed' | 'failed' | 'unavailable' = 'passed',
  ): string => {
    const base =
      reason === 'safety-limit'
        ? 'Prepared a partial draft after the agent reached its step safety limit; it was not reported as a completed request.'
        : validationStatus === 'unavailable'
          ? CHANGE_REQUEST_PATTERN.test(request)
            ? 'Prepared the requested changes for review; build validation was unavailable.'
            : 'Prepared the staged changes for review; build validation was unavailable.'
          : CHANGE_REQUEST_PATTERN.test(request)
            ? reason === 'fulfillment'
              ? 'Prepared the requested changes for review; deterministic request checks passed, but build validation was unavailable.'
              : 'Completed the requested changes and validated the build.'
            : reason === 'validate'
              ? 'Validated the staged changes after the local model repeated validation.'
              : reason === 'fulfillment'
                ? 'Prepared the staged changes for review; build validation was unavailable.'
                : reason === 'identical-write'
                  ? 'Validated the staged changes after the local model repeated an identical write action.'
                  : 'Validated the staged changes after the local model repeatedly read unchanged files.';
    return wiredEntry
      ? `${base} wired ${wiredEntry} to the new component so it renders in the app.`
      : base;
  };

export const isScratchEntry = (content: string | undefined): boolean =>
  Boolean(
    content && /<h1>New Project<\/h1>/.test(content) && /Start coding here\.\.\./.test(content),
  );

const sourceFenceLanguage = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'js') return 'js';
  if (extension === 'ts') return 'ts';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'json') return 'json';
  if (extension === 'html') return 'html';
  return 'jsx';
};

export const writeRecovery = (
  path: string,
  message: string,
  files: Record<string, string>,
): string => {
  if (/ReactDOM bootstrap|CSS-style object|nested code fence/i.test(message)) {
    const language = sourceFenceLanguage(path);
    return ` The rejected component was not staged. Write only ${path} in one closed ${language} fence. Return component source only: remove ReactDOM bootstrap code, CSS declarations, JavaScript style objects, nested markdown fences, and any other file content.`;
  }

  if (/CSS content cannot be written/.test(message)) {
    const language = sourceFenceLanguage(path);
    return ` The rejected content was not staged. You put CSS in a JSX/TSX action. Return exactly one write_file action for ${path} with one ${language} source fence. Create the matching *.module.css in a separate action on a later turn.`;
  }

  if (/Inline CSS is not allowed/.test(message)) {
    const language = sourceFenceLanguage(path);
    const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
    const stylesheetContext = Object.hasOwn(files, stylesheetPath)
      ? ` The stylesheet ${stylesheetPath} is already available; import it and apply its classes.`
      : ` Create ${stylesheetPath} in a separate write_file action, then import it from the component.`;
    return ` The rejected component was not staged.${stylesheetContext} Write only ${path} in this turn, using one ${language} source fence and no style prop or <style> tag.`;
  }

  if (!/(?:Unclosed|Unmatched|nesting exceeds|cannot reference itself)/.test(message)) {
    return '';
  }

  if (/\.css$/i.test(path)) {
    return ` The rejected stylesheet was not staged. Your next action must write only ${path}, using one css fence. Start with a small complete rule if necessary (for example, .app { display: block; }) and check that every { has one }. Do not include another file or source fence in this response.`;
  }

  const language = sourceFenceLanguage(path);
  return ` The rejected source file was not staged. Your next action must write only ${path}, using one ${language} fence. Return the complete source file, check that every bracket has a matching partner, and do not include a stylesheet or another source fence in this response.`;
};

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
  const targetFileBlock = Object.hasOwn(files, targetPath)
    ? `--- ${targetPath} ---\n${files[targetPath]}`
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
  let guidance = generationGuidanceForRequest(request, {
    interactiveContract: lightweight || includeProductContract,
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

const buildFenceOnlyRecoveryMessages = ({
  request,
  targetPath,
  files,
  incompleteWrite = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  incompleteWrite?: boolean;
}): WebLLMMessage[] => {
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const fenceFormat = [`\`\`\`${recoveryLanguage}`, 'complete source content here', '```'].join(
    '\n',
  );
  const targetContent = targetPath ? files[targetPath] : undefined;
  const isScratch = targetPath ? isScratchEntry(targetContent) : false;
  const context =
    targetPath && targetContent !== undefined && !isScratch
      ? `Current contents of ${targetPath}:\n${targetContent}`
      : targetPath
        ? `Write the complete implementation for ${targetPath}.`
        : 'Write the complete application entry source.';
  const incompleteWriteHint = incompleteWrite
    ? 'The previous reply had write_file metadata without source content. Reply with ONLY the labelled code fence — no JSON line.'
    : null;

  return [
    {
      role: 'system',
      content: `You are in emergency write mode. Reply with ONLY this labelled code fence and nothing else:\n${fenceFormat}\nReplace the placeholder with complete working source. The response must be one closed component source fence. Do not return JSON, list files, validate, finish, prose, ReactDOM bootstrap code, CSS declarations, a JavaScript styles object, or another source file.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        ...generationGuidanceForRequest(request, { interactiveContract: true }),
        ...(incompleteWriteHint ? [incompleteWriteHint] : []),
        `Required destination: ${recoveryPath}`,
        context,
        `Return only:\n${fenceFormat}`,
      ].join('\n\n'),
    },
  ];
};

export const buildForcedWriteRecoveryMessages = ({
  request,
  targetPath,
  files,
  lightweight = false,
  incompleteWrite = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  lightweight?: boolean;
  incompleteWrite?: boolean;
}): WebLLMMessage[] => {
  if (lightweight) {
    return buildFenceOnlyRecoveryMessages({
      request,
      targetPath,
      files,
      incompleteWrite,
    });
  }

  const targetContent = targetPath ? files[targetPath] : undefined;
  const context = targetPath
    ? `Current contents of ${targetPath}:\n${targetContent ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose a project-relative entry path.';
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const writeFormat = [
    `{"action":"write_file","path":"${recoveryPath}","reason":"implement the request"}`,
    `\`\`\`${recoveryLanguage}`,
    'complete source content here',
    '```',
  ].join('\n');
  const recoveryInstruction = targetPath
    ? `Recovery mode is active. Your next response must be a write_file action for ${targetPath} with complete source content. Return exactly one write_file action for ${targetPath}.`
    : 'Recovery mode is active. Your next response must be a write_file action with complete source content. Return exactly one write_file action.';
  const incompleteWriteHint = incompleteWrite
    ? 'The previous reply had write_file metadata without source content. Include the complete file body in the same response as a labelled code fence immediately after the JSON line.'
    : null;

  return [
    {
      role: 'system',
      content: `You are in emergency write mode. Ignore normal inspection guidance: the workspace has already been inspected. Return exactly one write_file action now using this exact format:\n${writeFormat}\nReplace only the source fence contents. Do not put source code in a JSON content field. Do not list, search, read, validate, inspect the preview, finish, or explain.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        ...generationGuidanceForRequest(request),
        ...(incompleteWriteHint ? [incompleteWriteHint] : []),
        recoveryInstruction,
        targetPath
          ? `Required destination: ${targetPath}`
          : 'Required destination: choose the appropriate application source file.',
        context,
        `Implement the original request with complete source content. Return exactly one write_file action and nothing else. Use this format:\n${writeFormat}`,
      ].join('\n\n'),
    },
  ];
};

export const buildRepairFileMessages = ({
  request,
  targetPath,
  files,
  failedContent = '',
  diagnostic,
  lightweight = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  failedContent?: string;
  diagnostic: string;
  lightweight?: boolean;
}): WebLLMMessage[] => {
  const repairPath = targetPath || 'src/App.jsx';
  const language = sourceFenceLanguage(repairPath);
  const cleanedFailedContent = failedContent
    .replace(/^```(?:jsx|tsx|js|ts)?\s*/i, '')
    .replace(/\n(?:Return only|Your next response|The corrected source)[\s\S]*$/i, '')
    .replace(/\n```[\s\S]*$/i, '')
    .trim();
  const starterLike =
    /starter (?:template|screen)|placeholder copy/i.test(diagnostic) ||
    /<h1>\s*New Project\s*<\/h1>|Start coding here\.\.\./i.test(cleanedFailedContent);
  const currentContent = starterLike
    ? 'The failed source was the starter screen. Do not preserve or repeat its placeholder markup; generate the requested application from scratch.'
    : cleanedFailedContent || files[repairPath] || '(file does not exist yet)';
  const context = currentContent.slice(0, 16000);
  const fence = [`\`\`\`${language}`, 'complete corrected source here', '```'].join('\n');
  const sourceOnly = lightweight;
  const legacyGuidance = writeRecovery(repairPath, diagnostic, files);
  const emptyCollectionGuidance =
    /\buseState\s*\(\s*\[\s*\]\s*\)/.test(currentContent) && /\.map\s*\(/.test(currentContent)
      ? 'The failed source renders an empty collection. Add a visible input or textarea plus a Create/Add/Submit control wired to the insertion handler, or render a clear empty state that tells the user what to do next; item toggle/delete controls alone are incomplete.'
      : null;
  const interactiveRepairGuidance = [
    'This is an interactive app repair, not a copy-edit.',
    INTERACTIVE_GENERATION_GUIDANCE,
    ...(emptyCollectionGuidance ? [emptyCollectionGuidance] : []),
    'If the failed response is truncated or contains repair instructions, ignore that wrapper and regenerate the complete source from scratch; never echo the repair prompt into the file.',
  ].join('\n');
  const mappedClickableRepairGuidance =
    /non-interactive element as a clickable collection item/i.test(diagnostic)
      ? 'Specific structural fix: if the mapped root element itself has onClick (for example a board cell), make that element a <button type="button">. Nested controls inside a <li> or row (delete, toggle, checkbox) are already fine — do not rewrite those list items into buttons. Return the entire file changed; do not repeat the failed JSX unchanged.'
      : null;
  return [
    {
      role: 'system',
      content: sourceOnly
        ? `You are in emergency write mode repairing one failed source file. Reply with ONLY this labelled code fence and nothing else. Return one closed component source fence. Preserve the requested behavior and fix the reported issue. Do not return JSON, prose, CSS, another file, or an unfinished response.\n${fence}`
        : `You are repairing one failed source file. Return exactly one write_file action for ${repairPath} using this parser-safe format:\n{"action":"write_file","path":"${repairPath}","reason":"repair the failed file"}\n${fence}\nReplace only the source fence contents. Do not list, search, validate, finish, explain, or include another file.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        `Repair target: ${repairPath}`,
        `Validation or syntax diagnostic:\n${diagnostic}`,
        ...generationGuidanceForRequest(request),
        ...(legacyGuidance ? [`Targeted recovery guidance:${legacyGuidance}`] : []),
        ...(mappedClickableRepairGuidance ? [mappedClickableRepairGuidance] : []),
        interactiveRepairGuidance,
        `Failed source for ${repairPath}:\n${context}`,
        sourceOnly
          ? `Return only the corrected source in this format:\n${fence}`
          : `Return exactly one write_file action for ${repairPath} with complete corrected source in the fence.`,
      ].join('\n\n'),
    },
  ];
};

export const buildDirectChangesRecoveryMessages = ({
  request,
  targetPath,
  files,
  lightweight = false,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  lightweight?: boolean;
}): WebLLMMessage[] => {
  if (lightweight) {
    return buildFenceOnlyRecoveryMessages({ request, targetPath, files });
  }

  const context = targetPath
    ? `Current contents of ${targetPath}:\n${files[targetPath] ?? '(file does not exist yet)'}`
    : 'No existing application entry file was identified. Choose an appropriate project-relative path.';
  const recoveryPath = targetPath || 'src/App.jsx';
  const recoveryLanguage = sourceFenceLanguage(recoveryPath);
  const fencedWriteFormat = [
    `{"action":"write_file","path":"${recoveryPath}","reason":"implement the request"}`,
    `\`\`\`${recoveryLanguage}`,
    'complete source content here',
    '```',
  ].join('\n');
  return [
    {
      role: 'system',
      content: `You are in direct recovery mode. Return exactly one complete change response. Prefer this parser-safe write format:\n${fencedWriteFormat}\nYou may use the kind "changes" JSON format below when every file content is correctly JSON-escaped. Do not list files, read files, or explain.`,
    },
    {
      role: 'user',
      content: [
        `Original request: ${request}`,
        ...generationGuidanceForRequest(request),
        targetPath
          ? `Primary file: ${targetPath}`
          : 'Primary file: choose the application entry file.',
        context,
        'Return this exact shape: {"kind":"changes","summary":"...","changes":[{"path":"...","content":"complete file content"}]}',
        `For source code, the safer accepted alternative is:\n${fencedWriteFormat}`,
        'Implement the original request now. Include every file required for the implementation and no placeholder content.',
      ].join('\n\n'),
    },
  ];
};

export const buildActionLoopModelMessages = ({
  request,
  targetPath,
  files,
  failedWritePath,
  failedWriteContent,
  failedWriteDiagnostic,
  directChangesRecoveryPending,
  forcedWriteRecoveryPending,
  incompleteWriteRetries,
  lightweight,
  messages,
}: {
  request: string;
  targetPath: string | null;
  files: Record<string, string>;
  failedWritePath: string;
  failedWriteContent: string;
  failedWriteDiagnostic: string;
  directChangesRecoveryPending: boolean;
  forcedWriteRecoveryPending: boolean;
  incompleteWriteRetries: number;
  lightweight: boolean;
  messages: WebLLMMessage[];
}): WebLLMMessage[] => {
  if (failedWritePath) {
    return buildRepairFileMessages({
      request,
      targetPath,
      files,
      failedContent: failedWriteContent,
      diagnostic: failedWriteDiagnostic,
      lightweight,
    });
  }
  if (directChangesRecoveryPending) {
    return buildDirectChangesRecoveryMessages({ request, targetPath, files, lightweight });
  }
  if (forcedWriteRecoveryPending) {
    return buildForcedWriteRecoveryMessages({
      request,
      targetPath,
      files,
      lightweight,
      incompleteWrite: incompleteWriteRetries > 0,
    });
  }
  return messages;
};

export const isIncompleteWriteError = (message: string): boolean =>
  /write_file requires string content/i.test(message);

const GENERIC_FINISH_SUMMARY =
  /further development|start coding|proceed with|\/dist\b|build sequence|necessary files|successfully (?:created|built)(?:\s+\w+){0,4}\s+validat/i;

/** Replace scaffold-style finish blurbs with a request-grounded summary. */
export const normalizeFinishSummary = ({
  summary,
  request,
  changeCount,
  wiredEntry = null,
  validationStatus = 'passed',
}: {
  summary?: string | null;
  request: string;
  changeCount: number;
  wiredEntry?: string | null;
  validationStatus?: 'passed' | 'failed' | 'unavailable';
}): string => {
  const trimmed = typeof summary === 'string' ? summary.trim() : '';
  const clipped = request.trim().replace(/\s+/g, ' ').slice(0, 80);
  const validationUnavailable =
    validationStatus === 'unavailable' &&
    /\b(?:build|built|complete|completed|finish(?:ed)?|implement(?:ed)?|validat(?:e|ed|ion)|ready)\b/i.test(
      trimmed,
    );
  const useRequestSummary =
    CHANGE_REQUEST_PATTERN.test(request) &&
    changeCount > 0 &&
    (!trimmed || GENERIC_FINISH_SUMMARY.test(trimmed));
  const base = validationUnavailable
    ? 'Prepared the requested changes for review; build validation was unavailable.'
    : useRequestSummary
      ? `Implemented “${clipped}” and validated the build.`
      : trimmed || (changeCount > 0 ? `Prepared ${changeCount} file(s) for review.` : 'Done.');
  return wiredEntry
    ? `${base} Wired ${wiredEntry} to the new component so it renders in the app.`
    : base;
};
