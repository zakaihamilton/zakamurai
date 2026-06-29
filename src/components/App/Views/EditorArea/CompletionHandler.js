import { COMPLETION_SYSTEM_PROMPT } from '@/components/AI/Prompts';
import { createState } from '@/components/state/State';
import { useCallback, useEffect, useRef } from 'react';
import {
  COMPLETION_DEBOUNCE_MS,
  buildCompletionPrompt,
  normalizeCompletion,
} from './completionUtils';

const CompletionState = createState('CompletionState');

export default function useCompletion({
  localContent,
  cursorPos,
  filePath,
  enabled = true,
  onDebugUpdate,
}) {
  const completionState = CompletionState.useState(null, { suggestion: '', loading: false });
  const { suggestion = '', loading = false } = completionState || {};
  const setSuggestion = useCallback(
    (nextSuggestion) => {
      completionState((draft) => {
        draft.suggestion = nextSuggestion;
      });
    },
    [completionState],
  );
  const setLoading = useCallback(
    (nextLoading) => {
      completionState((draft) => {
        draft.loading = nextLoading;
      });
    },
    [completionState],
  );
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

    // Clear previous suggestion immediately on type
    lastRequestRef.current = scheduledRequestId;
    setSuggestion('');
    setLoading(true);

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

        if (before.trim().length === 0 && after.trim().length === 0) return;

        // Retrieve RAG context using the current line as query
        const currentLine = before.split('\n').pop() || '';
        let ragContext = '';
        try {
          const { ragSearch } = await import('@/utils/rag/search-utility');
          const ragResults = await ragSearch.retrieveContext(currentLine, 3);
          ragContext = ragSearch.formatPromptContext(ragResults);
        } catch (ragErr) {
          console.error('[Completion] RAG retrieval failed:', ragErr);
        }

        const scheduledPrompt = buildCompletionPrompt({
          filePath,
          before: scheduledBefore,
          after: scheduledAfter,
          ragContext,
        });

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
          const { askWebLLM } = await import('@/components/AI/WebLLMAPI');
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
  }, [localContent, cursorPos, filePath, enabled, setLoading, setSuggestion]);

  const cancelSuggestion = useCallback(
    (options = {}) => {
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
    },
    [setLoading, setSuggestion],
  );

  return { suggestion, setSuggestion, cancelSuggestion, loading };
}
