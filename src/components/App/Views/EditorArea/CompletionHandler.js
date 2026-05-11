import { COMPLETION_SYSTEM_PROMPT } from '@/components/AI/Prompts';
import { askWebLLM } from '@/components/AI/WebLLMAPI';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const buildCompletionPrompt = ({ filePath, before, after }) => {
  const beforeWindow = before.slice(-2400);
  const afterWindow = after.slice(0, 1200);

  return `
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

export default function useCompletion({
  localContent,
  cursorPos,
  filePath,
  enabled = true,
  onDebugUpdate,
}) {
  const [suggestion, setSuggestion] = useState('');
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef(null);
  const lastRequestRef = useRef(0);
  const requestCounterRef = useRef(0);
  const lastContentRef = useRef(localContent);
  const pendingContentRef = useRef(null);
  const pausedContentRef = useRef(null);
  const onDebugUpdateRef = useRef(onDebugUpdate);

  useEffect(() => {
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onDebugUpdate]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !cursorPos || cursorPos.index === undefined) {
      lastRequestRef.current = ++requestCounterRef.current;
      setSuggestion('');
      setLoading(false);
      return;
    }

    const contentChanged = lastContentRef.current !== localContent;
    lastContentRef.current = localContent;

    if (!contentChanged) {
      if (pendingContentRef.current !== localContent) {
        lastRequestRef.current = ++requestCounterRef.current;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setLoading(false);
      }
      setSuggestion('');
      return;
    }

    if (pausedContentRef.current === localContent) {
      lastRequestRef.current = ++requestCounterRef.current;
      setSuggestion('');
      setLoading(false);
      pendingContentRef.current = null;
      return;
    }

    pausedContentRef.current = null;

    const scheduledRequestId = ++requestCounterRef.current;
    const scheduledContent = localContent;
    const scheduledCursor = cursorPos;
    const scheduledBefore = scheduledContent.substring(0, scheduledCursor.index);
    const scheduledAfter = scheduledContent.substring(scheduledCursor.index);
    const scheduledPrompt = buildCompletionPrompt({
      filePath,
      before: scheduledBefore,
      after: scheduledAfter,
    });

    // Clear previous suggestion immediately on type
    lastRequestRef.current = scheduledRequestId;
    setSuggestion('');
    setLoading(true);
    onDebugUpdateRef.current?.({
      status: 'scheduled',
      filePath,
      prompt: scheduledPrompt,
      rawResult: '',
      completion: '',
      error: '',
      cursor: scheduledCursor,
      requestedAt: new Date().toISOString(),
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    pendingContentRef.current = localContent;

    // Debounce AI requests
    timeoutRef.current = setTimeout(
      async () => {
        const { index } = scheduledCursor;
        const before = scheduledContent.substring(0, index);
        const after = scheduledContent.substring(index);

        // Don't request if we just finished a line or are in middle of whitespace
        const lastChar = before.slice(-1);
        if (!lastChar || (/[\s\n]/.test(lastChar) && before.length > 0 && !/[\n]/.test(lastChar))) {
          // We might want to complete after space if it's start of a word, but let's be conservative
          // Actually, completion after newline or space is often desired.
          // Let's only skip if before is empty.
        }

        if (before.trim().length === 0 && after.trim().length === 0) return;

        onDebugUpdateRef.current?.({
          status: 'thinking',
          filePath,
          prompt: scheduledPrompt,
          rawResult: '',
          completion: '',
          error: '',
          cursor: scheduledCursor,
          requestedAt: new Date().toISOString(),
        });

        try {
          const result = await askWebLLM(scheduledPrompt, COMPLETION_SYSTEM_PROMPT, null, {
            temperature: 0.15,
            top_p: 0.75,
            presence_penalty: 0,
            frequency_penalty: 0.2,
            max_tokens: 96,
          });

          // Only update if this is still the latest request
          if (lastRequestRef.current === scheduledRequestId) {
            const cleaned = normalizeCompletion(result, before, after);

            onDebugUpdateRef.current?.({
              status: 'completed',
              filePath,
              prompt: scheduledPrompt,
              rawResult: result,
              completion: cleaned,
              error: '',
              cursor: scheduledCursor,
              completedAt: new Date().toISOString(),
            });
            setSuggestion(cleaned);
          }
        } catch (err) {
          console.error('Completion error:', err);
          onDebugUpdateRef.current?.({
            status: 'error',
            filePath,
            prompt: scheduledPrompt,
            rawResult: '',
            completion: '',
            error: err.message || String(err),
            cursor: scheduledCursor,
            completedAt: new Date().toISOString(),
          });
        } finally {
          if (lastRequestRef.current === scheduledRequestId) {
            setLoading(false);
            pendingContentRef.current = null;
          }
        }
      },
      process.env.NODE_ENV === 'test' ? 10 : COMPLETION_DEBOUNCE_MS,
    );

    return undefined;
  }, [localContent, cursorPos, filePath, enabled]);

  const cancelSuggestion = useCallback((options = {}) => {
    if (options.pauseUntilEdit) {
      pausedContentRef.current = lastContentRef.current;
    }
    lastRequestRef.current = ++requestCounterRef.current;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingContentRef.current = null;
    setSuggestion('');
    setLoading(false);
  }, []);

  return { suggestion, setSuggestion, cancelSuggestion, loading };
}
