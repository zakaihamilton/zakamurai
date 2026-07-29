export const COMPLETION_DEBOUNCE_MS = 500;
export const COMPLETION_PHASES = {
  DEBOUNCING: 'debouncing',
  RETRIEVING_CONTEXT: 'retrieving-context',
  RESOLVING_MODEL: 'resolving-model',
  GENERATING: 'generating',
};

export const getCompletionActivityMessage = (
  debug: { phase?: string; model?: string } | null | undefined,
): string | null => {
  if (!debug?.phase) return null;

  switch (debug.phase) {
    case COMPLETION_PHASES.DEBOUNCING:
      return 'Waiting for you to pause typing…';
    case COMPLETION_PHASES.RETRIEVING_CONTEXT:
      return 'Searching project context…';
    case COMPLETION_PHASES.RESOLVING_MODEL:
      return debug.model ? `Loading ${debug.model}…` : 'Loading completion model…';
    case COMPLETION_PHASES.GENERATING:
      return debug.model
        ? `Generating completion with ${debug.model}…`
        : 'Generating code completion…';
    default:
      return null;
  }
};

export const getCompletionStatusMessage = (
  activity: { phase?: string; model?: string } | null | undefined,
  isCompleting: boolean,
): string | null => {
  if (!isCompleting) return null;
  return (
    getCompletionActivityMessage(activity) ||
    getCompletionActivityMessage({ phase: COMPLETION_PHASES.DEBOUNCING })
  );
};

export const COMPLETION_REQUEST_TIMEOUT_MS = 90000;

const MAX_COMPLETION_LINES = 8;
const MAX_COMPLETION_CHARS = 500;

const stripCompletionNoise = (text: string): string => {
  let cleaned = text.replace(/\r\n/g, '\n');

  const completionTag = cleaned.match(/<completion>([\s\S]*?)<\/completion>/i);
  if (completionTag) {
    return completionTag[1];
  }

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(
    /^\s*(?:analysis|reasoning|thought|thinking):[\s\S]*?(?:final|answer|completion|suggestion):\s*/i,
    '',
  );
  cleaned = cleaned.replace(/^\s*(?:final answer|answer):\s*/i, '');

  if (cleaned.trimStart().startsWith('```')) {
    cleaned = cleaned.replace(/^\s*```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '');
  }

  cleaned = cleaned.replace(/^\s*(?:completion|suggestion):\s*/i, '');
  cleaned = cleaned.replace(/<\/?completion>/gi, '');

  const lines = cleaned.split('\n');
  const firstCodeLineIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    return !/^(?:i\s|the\s|we\s|this\s|it\s|since\s|because\s|given\s|cursor\s|so\s|therefore\s|looks?\s|need\s|should\s|probably\s|completion\s*:)/i.test(
      trimmed,
    );
  });

  if (firstCodeLineIndex > 0) {
    cleaned = lines.slice(firstCodeLineIndex).join('\n');
  }

  return cleaned;
};

const normalizeForOverlap = (text: string): string => text.replace(/\s+/g, ' ').trim();

const trimRepeatedPrefix = (completion: string, before: string): string => {
  const beforeNormalized = normalizeForOverlap(before);

  for (let i = completion.length; i > 0; i--) {
    const prefix = completion.slice(0, i);
    const prefixNormalized = normalizeForOverlap(prefix);

    if (prefixNormalized && beforeNormalized.endsWith(prefixNormalized)) {
      return completion.slice(i);
    }
  }

  return completion;
};

const trimRepeatedSuffix = (completion: string, after: string): string => {
  const afterNormalized = normalizeForOverlap(after);

  for (let i = completion.length; i > 0; i--) {
    const suffix = completion.slice(completion.length - i);
    const suffixNormalized = normalizeForOverlap(suffix);

    if (suffixNormalized && afterNormalized.startsWith(suffixNormalized)) {
      return completion.slice(0, completion.length - i);
    }
  }

  return completion;
};

const trimSharedBoundary = (completion: string, before: string, after: string): string => {
  const withoutPrefix = trimRepeatedPrefix(completion, before);
  return trimRepeatedSuffix(withoutPrefix, after);
};

const fixJsxClassNameCompletion = (completion: string, before: string): string => {
  const lineBeforeCursor = before.split('\n').pop() || '';

  if (!/\bclassName\s*=\s*\{\s*$/.test(lineBeforeCursor)) {
    return completion;
  }

  return completion
    .replace(/^\s*className\s*=\s*/i, '')
    .replace(/^\{\s*/, '')
    .replace(/\}\s*\}\s*$/, '}');
};

const fixJsxOpeningTagCompletion = (completion: string, before: string): string => {
  const lineBeforeCursor = before.split('\n').pop() || '';

  if (!lineBeforeCursor.endsWith('<')) return completion;

  const textBeforeDanglingAngle = lineBeforeCursor.slice(0, -1);
  const openingTags = [
    ...textBeforeDanglingAngle.matchAll(/<([A-Za-z][A-Za-z0-9]*)\b[^>]*(?<!\/)>/g),
  ];
  const openWrapper = openingTags.at(-1);

  if (openWrapper && /<([A-Z][A-Za-z0-9.]*)\s*\/>\s*[^<]+$/.test(textBeforeDanglingAngle)) {
    return `/${openWrapper[1]}>`;
  }

  if (/^[A-Za-z][A-Za-z0-9.]*\s*(?:\/>|>)/.test(completion.trimStart())) return completion;

  const repeatedItemPattern =
    /<([A-Za-z][A-Za-z0-9]*)\b[^>]*>\s*<([A-Z][A-Za-z0-9.]*)\s*\/>\s*([^<]+)<\/\1>/g;
  const repeatedItems = [...before.matchAll(repeatedItemPattern)];
  const previousItem = repeatedItems.at(-1);

  if (!previousItem) return completion;

  const [, wrapperTag, leadingComponent] = previousItem;
  const text = completion.trim();

  if (!text || /[<>{}]/.test(text)) return completion;

  return `${leadingComponent} /> ${text}</${wrapperTag}>`;
};

const getCursorLine = (before: string, after: string): string => {
  const lineBeforeCursor = before.split('\n').pop() || '';
  const lineAfterCursor = after.split('\n')[0] || '';
  return `${lineBeforeCursor}▮${lineAfterCursor}`;
};

const getLanguage = (filePath?: string): string => {
  if (filePath?.endsWith('.jsx')) return 'JavaScript JSX';
  if (filePath?.endsWith('.tsx')) return 'TypeScript JSX';
  if (filePath?.endsWith('.ts')) return 'TypeScript';
  if (filePath?.endsWith('.js')) return 'JavaScript';
  if (filePath?.endsWith('.css')) return 'CSS';
  if (filePath?.endsWith('.html')) return 'HTML';
  if (filePath?.endsWith('.json')) return 'JSON';
  if (filePath?.endsWith('.md')) return 'Markdown';
  return 'Plain text';
};

export const getCurrentToken = (before: string): string => {
  const lineBeforeCursor = before.split('\n').pop() || '';
  const match = lineBeforeCursor.match(/[A-Za-z0-9_$.[\]'"`-]*$/);
  return match?.[0] || '';
};

export const buildCompletionRagQuery = (before: string): string => {
  const lines = before.split('\n').slice(-3);
  const token = getCurrentToken(before);
  return [...lines, token].filter(Boolean).join('\n').trim();
};

const getRecentLines = (before: string): string => {
  const lines = before.split('\n');
  return lines.slice(Math.max(0, lines.length - 3)).join('\n');
};

export const buildCompletionPrompt = ({
  filePath,
  before,
  after,
  ragContext = '',
}: {
  filePath: string;
  before: string;
  after: string;
  ragContext?: string;
}): string => {
  const beforeWindow = before.slice(-2400);
  const afterWindow = after.slice(0, 1200);

  return `
${ragContext}
File: ${filePath}
Language: ${getLanguage(filePath)}
Cursor is marked with ▮.

Recent lines:
${getRecentLines(before) || '(none)'}

Current line:
${getCursorLine(before, after)}

Current partial token before cursor:
${getCurrentToken(before) || '(none)'}

Code before cursor:
${beforeWindow}

Code after cursor:
${afterWindow}

Return only <completion>text to insert at ▮</completion>.
`.trim();
};

const limitCompletionScope = (completion: string): string => {
  if (completion.length > MAX_COMPLETION_CHARS) return '';
  const lines = completion.split('\n');
  if (lines.length > MAX_COMPLETION_LINES) {
    return lines.slice(0, MAX_COMPLETION_LINES).join('\n').trimEnd();
  }
  return completion;
};

const extractStreamingCompletionText = (raw: string): string => {
  const closedTag = raw.match(/<completion>([\s\S]*?)<\/completion>/i);
  if (closedTag) return closedTag[1];

  const openTag = raw.match(/<completion>([\s\S]*)$/i);
  if (openTag) return openTag[1];

  if (/<\/?comp(?:letion)?>?$/i.test(raw.trim())) return '';

  return '';
};

const polishCompletionText = (
  cleaned: string,
  before: string,
  after: string,
  { limitScope = true }: { limitScope?: boolean } = {},
): string => {
  if (!cleaned.trim()) return '';

  const beforeTrimmed = before.trimEnd();
  const afterTrimmed = after.trimStart();
  const cleanedTrimmed = cleaned.trim();

  let result = cleaned;

  if (cleanedTrimmed.startsWith(beforeTrimmed) && beforeTrimmed) {
    result = cleanedTrimmed.slice(beforeTrimmed.length);
  }

  if (afterTrimmed && result.trimEnd().endsWith(afterTrimmed)) {
    result = result.trimEnd().slice(0, -afterTrimmed.length);
  }

  result = fixJsxClassNameCompletion(result, before);
  result = fixJsxOpeningTagCompletion(result, before);

  const trimmed = trimSharedBoundary(result, before, after);
  return limitScope ? limitCompletionScope(trimmed) : trimmed;
};

export const normalizeStreamingCompletion = (
  rawCompletion: string,
  before: string,
  after: string,
): string => {
  if (!/<completion>/i.test(rawCompletion)) {
    if (/<\/?comp(?:letion)?>?$/i.test(rawCompletion.trim())) return '';
    return '';
  }

  let extracted = extractStreamingCompletionText(rawCompletion);
  if (!extracted) return '';

  extracted = extracted.replace(/<\/?completion>/gi, '');

  return polishCompletionText(extracted, before, after, { limitScope: false });
};

export const normalizeCompletion = (
  rawCompletion: string,
  before: string,
  after: string,
): string => {
  const cleaned = stripCompletionNoise(rawCompletion);
  return polishCompletionText(cleaned, before, after, { limitScope: true });
};

export const getNextSuggestionWord = (suggestion: string): string => {
  if (!suggestion) return '';
  const match = suggestion.match(/^(\s*\S+\s*)/);
  return match ? match[1] : suggestion;
};
