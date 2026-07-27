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

export const PromptRegistry = {
  v1: {
    edit: DEFAULT_SYSTEM_PROMPT,
    completion: COMPLETION_SYSTEM_PROMPT,
    searchReplace: SEARCH_REPLACE_INSTRUCTION,
  },
  getPrompt(type = 'edit', version = 'v1') {
    return this[version]?.[type] ?? DEFAULT_SYSTEM_PROMPT;
  },
};

const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_CHARS = 1400;
const MAX_ACTIVE_FILE_CHARS = 6000;

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

  for (const result of results.slice(0, maxFiles)) {
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

  return sections.join('\n\n---\n\n');
}
