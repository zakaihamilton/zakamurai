/**
 * System prompts and AI configuration for Zakamurai.
 */

export type ContextFileResult = {
  filePath: string;
  content: string;
  score?: number;
  linkedCss?: Array<{ filePath: string; content: string }>;
};

export type PromptOptions = {
  maxContextFiles?: number;
  maxContextChars?: number;
  maxActiveFileChars?: number;
  maxTokenBudget?: number;
};

export {
  COMPLETION_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  PATCH_SYSTEM_PROMPT,
  PLANNING_SYSTEM_PROMPT,
  PromptRegistry,
  REPAIR_SYSTEM_PROMPT,
  SEARCH_REPLACE_INSTRUCTION,
} from './PromptTemplates';
export type { PromptRegistryShape } from './PromptTemplates';

const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_CHARS = 1400;
const MAX_ACTIVE_FILE_CHARS = 6000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text = '') {
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function trimText(value: string, maxChars: number): string {
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function formatFileBlock(label: string, path: string, content: string): string {
  return `${label}: ${path}\n\`\`\`\n${content}\n\`\`\``;
}

export function formatCompactContext(
  results: ContextFileResult[] = [],
  options: PromptOptions = {},
): string {
  const maxFiles = options.maxContextFiles ?? MAX_CONTEXT_FILES;
  const maxChars = options.maxContextChars ?? MAX_CONTEXT_CHARS;
  const blocks = [];

  // Prioritize files with linked CSS modules or direct imports
  const sortedResults = [...results].sort((a, b) => {
    const aScore = (a.linkedCss?.length ? 2 : 0) + (a.score ?? 0);
    const bScore = (b.linkedCss?.length ? 2 : 0) + (b.score ?? 0);
    return bScore - aScore;
  });

  for (const result of sortedResults.slice(0, maxFiles)) {
    blocks.push(
      formatFileBlock('Related file', result.filePath, trimText(result.content, maxChars)),
    );

    const cssFile = result.linkedCss?.[0];
    if (cssFile) {
      blocks.push(
        formatFileBlock('Related CSS', cssFile.filePath, trimText(cssFile.content, maxChars)),
      );
    }
  }

  return blocks.join('\n\n');
}

export function allocateTokenBudget({
  systemPrompt = '',
  userRequest = '',
  activeFileContent = '',
  relatedContext = [],
  maxTokenBudget = 4000,
}: {
  systemPrompt?: string;
  userRequest?: string;
  activeFileContent?: string;
  relatedContext?: ContextFileResult[];
  maxTokenBudget?: number;
}) {
  const systemTokens = estimateTokens(systemPrompt);
  const requestTokens = estimateTokens(userRequest);
  const remainingForContent = Math.max(100, maxTokenBudget - systemTokens - requestTokens);

  const activeTokens = estimateTokens(activeFileContent);
  let budgetedActiveContent = activeFileContent;
  let budgetedContext = relatedContext;

  if (activeTokens > remainingForContent * 0.7) {
    const maxActiveChars = Math.floor(remainingForContent * 0.7 * CHARS_PER_TOKEN);
    budgetedActiveContent = trimText(activeFileContent, maxActiveChars);
  }

  const activeUsed = estimateTokens(budgetedActiveContent);
  const remainingForContext = Math.max(0, remainingForContent - activeUsed);

  if (relatedContext.length > 0) {
    let contextTokens = estimateTokens(formatCompactContext(relatedContext));
    while (contextTokens > remainingForContext && budgetedContext.length > 0) {
      budgetedContext = budgetedContext.slice(0, budgetedContext.length - 1);
      contextTokens = estimateTokens(formatCompactContext(budgetedContext));
    }
  }

  return {
    activeFileContent: budgetedActiveContent,
    relatedContext: budgetedContext,
    estimatedTokens:
      systemTokens +
      requestTokens +
      estimateTokens(budgetedActiveContent) +
      estimateTokens(formatCompactContext(budgetedContext)),
  };
}

export function buildPlanningPrompt({
  userRequest,
  activeFilePath,
  activeFileContent,
  relatedContext = [],
  options = {},
}: {
  userRequest: string;
  activeFilePath?: string;
  activeFileContent?: string;
  relatedContext?: ContextFileResult[];
  options?: PromptOptions;
}) {
  const sections = [];
  if (activeFilePath && activeFileContent !== undefined) {
    sections.push(
      formatFileBlock(
        'Current file',
        activeFilePath,
        trimText(activeFileContent, options.maxActiveFileChars ?? MAX_ACTIVE_FILE_CHARS),
      ),
    );
  }
  const context = formatCompactContext(relatedContext, options);
  if (context) sections.push(context);

  sections.push(`User request:\n${userRequest}`);
  return sections.join('\n\n---\n\n');
}

export function buildPatchPrompt({
  userRequest,
  plan,
  activeFilePath,
  activeFileContent,
  selectedLines = [],
  relatedContext = [],
  options = {},
}: {
  userRequest: string;
  plan?: string;
  activeFilePath?: string;
  activeFileContent?: string;
  selectedLines?: number[];
  relatedContext?: ContextFileResult[];
  options?: PromptOptions;
}) {
  const sections = [];
  if (plan) {
    sections.push(`Implementation Plan:\n${plan}`);
  }
  if (activeFilePath && activeFileContent !== undefined) {
    sections.push(
      formatFileBlock(
        'Current file',
        activeFilePath,
        trimText(activeFileContent, options.maxActiveFileChars ?? MAX_ACTIVE_FILE_CHARS),
      ),
    );
  }
  const context = formatCompactContext(relatedContext, options);
  if (context) sections.push(context);

  if (selectedLines.length > 0) {
    sections.push(
      `Selected lines: ${selectedLines.join(', ')}\nOnly edit those lines unless the request clearly needs nearby code.`,
    );
  }

  sections.push(`User request:\n${userRequest}`);
  return sections.join('\n\n---\n\n');
}

export function buildRepairPrompt({
  userRequest,
  filePath,
  originalContent,
  failedPatch,
  diagnosticError,
}: {
  userRequest: string;
  filePath: string;
  originalContent: string;
  failedPatch: string;
  diagnosticError: string;
}) {
  return [
    `Target File: ${filePath}`,
    `Original Content:\n\`\`\`\n${originalContent}\n\`\`\``,
    `Failed Patch Attempt:\n\`\`\`\n${failedPatch}\n\`\`\``,
    `Diagnostic Error Trace:\n${diagnosticError}`,
    `User Request:\n${userRequest}`,
  ].join('\n\n---\n\n');
}

export function buildEditPrompt({
  userRequest,
  activeFilePath,
  activeFileContent,
  selectedLines = [],
  relatedContext = [],
  options = {},
}: {
  userRequest: string;
  activeFilePath?: string;
  activeFileContent?: string;
  selectedLines?: number[];
  relatedContext?: ContextFileResult[];
  options?: PromptOptions;
}) {
  const sections = [];
  const maxActiveChars = options.maxActiveFileChars ?? MAX_ACTIVE_FILE_CHARS;

  if (activeFilePath && activeFileContent !== undefined) {
    sections.push(
      formatFileBlock('Current file', activeFilePath, trimText(activeFileContent, maxActiveChars)),
    );
  }

  const context = formatCompactContext(relatedContext, options);
  if (context) {
    sections.push(context);
  }

  if (selectedLines.length > 0) {
    sections.push(
      `Selected lines: ${selectedLines.join(', ')}\nOnly edit those lines unless the request clearly needs nearby code.`,
    );
  }

  sections.push(`User request:\n${userRequest}`);

  const promptText = sections.join('\n\n---\n\n');

  if (options.maxTokenBudget) {
    const estimated = estimateTokens(promptText);
    if (estimated > options.maxTokenBudget && relatedContext.length > 1) {
      // Re-build with reduced context files to fit token budget
      return buildEditPrompt({
        userRequest,
        activeFilePath,
        activeFileContent,
        selectedLines,
        relatedContext: relatedContext.slice(0, Math.max(1, relatedContext.length - 1)),
        options: { ...options, maxTokenBudget: undefined },
      });
    }
  }

  return promptText;
}
