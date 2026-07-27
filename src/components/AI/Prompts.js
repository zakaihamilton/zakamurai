/**
 * System prompts and AI configuration for Zakamurai.
 */

export const DEFAULT_SYSTEM_PROMPT = `
You are a precise code editor.
To edit:
// --- File: path/to/file.js ---
<<<<<<< SEARCH
[exact lines]
=======
[new lines]
>>>>>>> REPLACE
// --- End File ---

Rules:
1. ONLY code.
2. Be brief.
3. No chat.
4. Use SEARCH/REPLACE for most edits.
5. If providing a snippet WITHOUT SEARCH/REPLACE, you MUST include 1-2 lines of existing code as context (anchors) so the change can be located.
`.trim();

export const SEARCH_REPLACE_INSTRUCTION = `
To edit, use:
<<<<<<< SEARCH
[old]
=======
[new]
>>>>>>> REPLACE
`.trim();

export const COMPLETION_SYSTEM_PROMPT = `
You are a code completion assistant.
Insert only the text that belongs at the cursor marked ▮.
Rules:
1. Never repeat text already before or after ▮.
2. Match surrounding indentation, quote style, and language conventions.
3. No prose, markdown fences, labels, or explanations.
4. Prefer completing the current statement or expression over large rewrites.
5. Return only: <completion>TEXT</completion>
`.trim();

export const PLANNING_SYSTEM_PROMPT = `
You are a software architect planning a codebase modification.
Analyze the user request and provided code files.
Produce a concise, structured action plan.
Format your output as:
// --- Plan ---
- Objective: [1-sentence summary]
- Files to modify: [comma-separated paths]
- Key changes: [bullet points of precise modifications]
// --- End Plan ---
`.trim();

export const PATCH_SYSTEM_PROMPT = `
You are a precise code generation assistant.
Based on the provided implementation plan and target files, produce exact code patches using SEARCH/REPLACE blocks.

Format:
// --- File: path/to/file.js ---
<<<<<<< SEARCH
[exact existing lines]
=======
[new replacement lines]
>>>>>>> REPLACE
// --- End File ---

Rules:
1. Output ONLY file blocks. No explanations outside blocks.
2. Ensure exact character matching for the SEARCH section.
3. Never use placeholders like "[...rest of code...]".
`.trim();

export const REPAIR_SYSTEM_PROMPT = `
You are an expert bug-fix assistant repairing an invalid AI edit.
The previous edit attempt caused a syntax error or failed to apply cleanly to the target file.

Review the diagnostic error trace carefully and fix the issue.
Produce a corrected SEARCH/REPLACE patch for the file.

Format:
// --- File: path/to/file.js ---
<<<<<<< SEARCH
[exact existing lines]
=======
[corrected lines]
>>>>>>> REPLACE
// --- End File ---
`.trim();

export const PromptRegistry = {
  v1: {
    edit: DEFAULT_SYSTEM_PROMPT,
    completion: COMPLETION_SYSTEM_PROMPT,
    searchReplace: SEARCH_REPLACE_INSTRUCTION,
  },
  v2: {
    planning: PLANNING_SYSTEM_PROMPT,
    patch: PATCH_SYSTEM_PROMPT,
    repair: REPAIR_SYSTEM_PROMPT,
    edit: DEFAULT_SYSTEM_PROMPT,
    completion: COMPLETION_SYSTEM_PROMPT,
    searchReplace: SEARCH_REPLACE_INSTRUCTION,
  },
  getPrompt(type = 'edit', version = 'v2') {
    return this[version]?.[type] ?? this.v1[type] ?? DEFAULT_SYSTEM_PROMPT;
  },
};

const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_CHARS = 1400;
const MAX_ACTIVE_FILE_CHARS = 6000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text = '') {
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function trimText(value, maxChars) {
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function formatFileBlock(label, path, content) {
  return `${label}: ${path}\n\`\`\`\n${content}\n\`\`\``;
}

export function formatCompactContext(results = [], options = {}) {
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
