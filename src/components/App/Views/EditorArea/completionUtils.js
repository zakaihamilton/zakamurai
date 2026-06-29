export const COMPLETION_DEBOUNCE_MS = 1000;
const MAX_COMPLETION_LINES = 8;
const MAX_COMPLETION_CHARS = 500;

const stripCompletionNoise = (text) => {
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

const normalizeForOverlap = (text) => text.replace(/\s+/g, ' ').trim();

const trimRepeatedPrefix = (completion, before) => {
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

const trimRepeatedSuffix = (completion, after) => {
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

const trimSharedBoundary = (completion, before, after) => {
  const withoutPrefix = trimRepeatedPrefix(completion, before);
  return trimRepeatedSuffix(withoutPrefix, after);
};

const fixJsxClassNameCompletion = (completion, before) => {
  const lineBeforeCursor = before.split('\n').pop() || '';

  if (!/\bclassName\s*=\s*\{\s*$/.test(lineBeforeCursor)) {
    return completion;
  }

  return completion
    .replace(/^\s*className\s*=\s*/i, '')
    .replace(/^\{\s*/, '')
    .replace(/\}\s*\}\s*$/, '}');
};

const fixJsxOpeningTagCompletion = (completion, before) => {
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

const getCursorLine = (before, after) => {
  const lineBeforeCursor = before.split('\n').pop() || '';
  const lineAfterCursor = after.split('\n')[0] || '';
  return `${lineBeforeCursor}▮${lineAfterCursor}`;
};

const getLanguage = (filePath) => {
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

const getCurrentToken = (before) => {
  const lineBeforeCursor = before.split('\n').pop() || '';
  const match = lineBeforeCursor.match(/[A-Za-z0-9_$.[\]'"`-]*$/);
  return match?.[0] || '';
};

export const buildCompletionPrompt = ({ filePath, before, after, ragContext = '' }) => {
  const beforeWindow = before.slice(-2400);
  const afterWindow = after.slice(0, 1200);

  return `
${ragContext}
File: ${filePath}
Language: ${getLanguage(filePath)}
Cursor is marked with ▮.

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

const limitCompletionScope = (completion) => {
  if (completion.length > MAX_COMPLETION_CHARS) return '';
  const lines = completion.split('\n');
  if (lines.length > MAX_COMPLETION_LINES) {
    return lines.slice(0, MAX_COMPLETION_LINES).join('\n').trimEnd();
  }
  return completion;
};

export const normalizeCompletion = (rawCompletion, before, after) => {
  let cleaned = stripCompletionNoise(rawCompletion);

  if (!cleaned.trim()) return '';

  const beforeTrimmed = before.trimEnd();
  const afterTrimmed = after.trimStart();
  const cleanedTrimmed = cleaned.trim();

  if (cleanedTrimmed.startsWith(beforeTrimmed) && beforeTrimmed) {
    cleaned = cleanedTrimmed.slice(beforeTrimmed.length);
  }

  if (afterTrimmed && cleaned.trimEnd().endsWith(afterTrimmed)) {
    cleaned = cleaned.trimEnd().slice(0, -afterTrimmed.length);
  }

  cleaned = fixJsxClassNameCompletion(cleaned, before);
  cleaned = fixJsxOpeningTagCompletion(cleaned, before);

  return limitCompletionScope(trimSharedBoundary(cleaned, before, after));
};
