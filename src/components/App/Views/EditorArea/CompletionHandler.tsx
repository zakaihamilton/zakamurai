import { COMPLETION_SYSTEM_PROMPT } from '@/components/AI/Prompts';
import { RagState } from '@/components/AI/RagState';
import { responseFormatForTask } from '@/components/AI/ReliabilityContracts';
import {
  RECOMMENDED_COMPLETION_MODEL,
  resolveCompletionModelId,
} from '@/components/AI/WebLLMModels';
import { PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { createState } from '@/components/state/State';
import type { CompletionStateShape, CursorPosition } from '@/components/state/domain-types';
import { useCallback, useEffect, useRef } from 'react';
import {
  COMPLETION_DEBOUNCE_MS,
  COMPLETION_PHASES,
  COMPLETION_REQUEST_TIMEOUT_MS,
  buildCompletionPrompt,
  buildCompletionRagQuery,
  normalizeCompletion,
} from './completionUtils';
import type {
  CancelSuggestionOptions,
  CompletionDebugPayload,
  CompletionHandlerProps,
} from './types';

const CompletionState = createState<CompletionStateShape>('CompletionState');

const getCursorIndex = (cursorPos: CursorPosition | undefined, content: string): number => {
  if (cursorPos?.index !== undefined) return cursorPos.index;
  return content.length;
};

const createDebugPayload = ({
  status,
  phase,
  filePath,
  prompt = '',
  rawResult = '',
  completion = '',
  error = '',
  cursor,
  model = '',
  requestedAt,
  completedAt,
}: Partial<CompletionDebugPayload> &
  Pick<CompletionDebugPayload, 'status' | 'filePath'>): CompletionDebugPayload => ({
  status,
  phase: phase || '',
  filePath,
  prompt,
  rawResult,
  completion,
  error,
  cursor,
  model,
  requestedAt: requestedAt || '',
  completedAt: completedAt || '',
});

export default function useCompletion({
  localContent,
  cursorPos,
  filePath,
  enabled = true,
  onDebugUpdate,
}: CompletionHandlerProps) {
  const completionState = CompletionState.useState(null, { suggestion: '', loading: false });
  const promptUiState = PromptUiState.usePassiveState();
  const selectedModel = promptUiState?.selectedModel;
  const ragState = RagState.usePassiveState();
  const ragStatus = ragState?.status;
  const { suggestion = '', loading = false } = completionState || {};
  const setSuggestion = useCallback(
    (nextSuggestion: string) => {
      completionState?.((draft) => {
        draft.suggestion = nextSuggestion;
      });
    },
    [completionState],
  );
  const setLoading = useCallback(
    (nextLoading: boolean) => {
      completionState?.((draft) => {
        draft.loading = nextLoading;
      });
    },
    [completionState],
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestRef = useRef(0);
  const requestCounterRef = useRef(0);
  const lastContentRef = useRef(localContent);
  const pendingContentRef = useRef<string | null>(null);
  const pausedContentRef = useRef<string | null>(null);
  const skipNextEditRef = useRef(false);
  const deferredEditRef = useRef<{ content: string; filePath: string } | null>(null);
  const cursorPosRef = useRef(cursorPos);
  const activeCompletionModelRef = useRef<string | null>(null);
  const activeCompletionControllerRef = useRef<AbortController | null>(null);
  const onDebugUpdateRef = useRef(onDebugUpdate);

  const reportDebug = useCallback((payload: CompletionDebugPayload) => {
    onDebugUpdateRef.current?.(payload);
  }, []);

  const clearRequestTimeout = useCallback(() => {
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  }, []);

  const invalidateActiveRequest = useCallback(() => {
    lastRequestRef.current = ++requestCounterRef.current;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    clearRequestTimeout();
    pendingContentRef.current = null;
  }, [clearRequestTimeout]);

  const stopThinking = useCallback(
    (options: CancelSuggestionOptions = {}) => {
      const modelToInterrupt = activeCompletionModelRef.current;
      const controllerToAbort = activeCompletionControllerRef.current;
      if (controllerToAbort && options.interrupt !== false) {
        activeCompletionControllerRef.current = null;
        activeCompletionModelRef.current = null;
        controllerToAbort.abort();
      } else if (modelToInterrupt && options.interrupt !== false) {
        activeCompletionModelRef.current = null;
        import('@/components/AI/WebLLMAPI').then(({ interruptWebLLMModel }) => {
          interruptWebLLMModel(modelToInterrupt);
        });
      }

      invalidateActiveRequest();

      if (!options.keepSuggestion) {
        setSuggestion('');
      }
      setLoading(false);

      if (options.report !== false) {
        reportDebug(
          createDebugPayload({
            status: 'idle',
            phase: '',
            filePath,
            error: options.error || '',
            completedAt: new Date().toISOString(),
          }),
        );
      }
    },
    [filePath, invalidateActiveRequest, reportDebug, setLoading, setSuggestion],
  );

  useEffect(() => {
    cursorPosRef.current = cursorPos;
  }, [cursorPos]);

  useEffect(() => {
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onDebugUpdate]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearRequestTimeout();
      lastRequestRef.current = ++requestCounterRef.current;

      const modelToInterrupt = activeCompletionModelRef.current;
      const controllerToAbort = activeCompletionControllerRef.current;
      if (controllerToAbort) {
        activeCompletionControllerRef.current = null;
        activeCompletionModelRef.current = null;
        controllerToAbort.abort();
      } else if (modelToInterrupt) {
        activeCompletionModelRef.current = null;
        import('@/components/AI/WebLLMAPI').then(({ interruptWebLLMModel }) => {
          interruptWebLLMModel(modelToInterrupt);
        });
      }

      setLoading(false);
    };
  }, [clearRequestTimeout, setLoading]);

  useEffect(() => {
    if (!enabled) {
      deferredEditRef.current = null;
      stopThinking({ interrupt: true, report: true });
      return;
    }

    const contentChanged = lastContentRef.current !== localContent;
    lastContentRef.current = localContent;

    if (skipNextEditRef.current) {
      skipNextEditRef.current = false;
      invalidateActiveRequest();
      setLoading(false);
      reportDebug(
        createDebugPayload({
          status: 'idle',
          phase: '',
          filePath,
          completedAt: new Date().toISOString(),
        }),
      );
      return;
    }

    const hasCursor = cursorPos?.index !== undefined;

    if (!hasCursor) {
      if (contentChanged) {
        deferredEditRef.current = { content: localContent, filePath };
      }
      stopThinking({ interrupt: false, report: true });
      return;
    }

    const isDeferredCatchUp =
      !contentChanged &&
      deferredEditRef.current?.content === localContent &&
      deferredEditRef.current?.filePath === filePath;

    if (!contentChanged && !isDeferredCatchUp) {
      if (pendingContentRef.current !== localContent) {
        stopThinking({ interrupt: true, report: true });
      }
      setSuggestion('');
      return;
    }

    if (isDeferredCatchUp) {
      deferredEditRef.current = null;
    }

    if (pausedContentRef.current === localContent) {
      stopThinking({ interrupt: true, report: true });
      return;
    }

    pausedContentRef.current = null;

    const scheduledRequestId = ++requestCounterRef.current;
    const scheduledContent = localContent;
    const scheduledCursor = cursorPosRef.current || cursorPos;
    const scheduledIndex = getCursorIndex(scheduledCursor, scheduledContent);
    const scheduledBefore = scheduledContent.substring(0, scheduledIndex);
    const scheduledAfter = scheduledContent.substring(scheduledIndex);

    lastRequestRef.current = scheduledRequestId;
    setSuggestion('');
    setLoading(true);
    reportDebug(
      createDebugPayload({
        status: 'thinking',
        phase: COMPLETION_PHASES.DEBOUNCING,
        filePath,
        cursor: { ...scheduledCursor, index: scheduledIndex },
        requestedAt: new Date().toISOString(),
      }),
    );

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    pendingContentRef.current = localContent;

    timeoutRef.current = setTimeout(
      async () => {
        const activeCursor = cursorPosRef.current || scheduledCursor;
        const index = getCursorIndex(activeCursor, scheduledContent);
        const before = scheduledContent.substring(0, index);
        const after = scheduledContent.substring(index);

        const finishRequest = () => {
          clearRequestTimeout();
          if (lastRequestRef.current === scheduledRequestId) {
            setLoading(false);
            pendingContentRef.current = null;
          }
        };

        if (before.trim().length === 0 && after.trim().length === 0) {
          reportDebug(
            createDebugPayload({
              status: 'idle',
              phase: '',
              filePath,
              cursor: { ...activeCursor, index },
              completedAt: new Date().toISOString(),
            }),
          );
          finishRequest();
          return;
        }

        requestTimeoutRef.current = setTimeout(() => {
          if (lastRequestRef.current !== scheduledRequestId) return;
          stopThinking({
            interrupt: true,
            report: true,
            error: 'Completion timed out. Press Esc to cancel or keep typing to retry.',
          });
        }, COMPLETION_REQUEST_TIMEOUT_MS);

        reportDebug(
          createDebugPayload({
            status: 'thinking',
            phase: COMPLETION_PHASES.RETRIEVING_CONTEXT,
            filePath,
            cursor: { ...activeCursor, index },
            requestedAt: new Date().toISOString(),
          }),
        );

        const ragQuery = buildCompletionRagQuery(before);
        let ragContext = '';
        try {
          if (ragStatus === 'ready') {
            const { ragSearch } = await import('@/utils/rag/search-utility');
            const ragResults = await ragSearch.retrieveContext(ragQuery, 3);
            ragContext = ragSearch.formatPromptContext(ragResults);
          }
        } catch (ragErr) {
          console.error('[Completion] RAG retrieval failed:', ragErr);
        }

        if (lastRequestRef.current !== scheduledRequestId) return;

        const scheduledPrompt = buildCompletionPrompt({
          filePath,
          before: scheduledBefore,
          after: scheduledAfter,
          ragContext,
        });

        reportDebug(
          createDebugPayload({
            status: 'thinking',
            phase: COMPLETION_PHASES.RESOLVING_MODEL,
            filePath,
            prompt: scheduledPrompt,
            cursor: { ...activeCursor, index },
            requestedAt: new Date().toISOString(),
          }),
        );

        const scheduledPromptForError = scheduledPrompt;

        try {
          const completionModelId = await resolveCompletionModelId(selectedModel);
          if (lastRequestRef.current !== scheduledRequestId) return;
          activeCompletionModelRef.current = completionModelId;
          const completionController = new AbortController();
          activeCompletionControllerRef.current = completionController;
          let actualCompletionModelId = completionModelId;

          reportDebug(
            createDebugPayload({
              status: 'thinking',
              phase: COMPLETION_PHASES.GENERATING,
              filePath,
              prompt: scheduledPrompt,
              cursor: { ...activeCursor, index },
              model: completionModelId,
              requestedAt: new Date().toISOString(),
            }),
          );

          const { askWebLLM } = await import('@/components/AI/WebLLMAPI');
          const result = await askWebLLM(scheduledPrompt, COMPLETION_SYSTEM_PROMPT, null, {
            model: completionModelId,
            signal: completionController.signal,
            requestKind: 'completion',
            responseFormat: responseFormatForTask('completion'),
            taskKind: 'completion',
            attempt: 1,
            onRecovery: (recovery) => {
              actualCompletionModelId = recovery.modelId;
              activeCompletionModelRef.current = recovery.modelId;
              reportDebug(
                createDebugPayload({
                  status: 'thinking',
                  phase: COMPLETION_PHASES.GENERATING,
                  filePath,
                  prompt: scheduledPrompt,
                  error: `Recovering with ${recovery.modelId} after ${recovery.reason.replaceAll('-', ' ')}.`,
                  cursor: { ...activeCursor, index },
                  model: recovery.modelId,
                  requestedAt: new Date().toISOString(),
                }),
              );
            },
            temperature: 0.1,
            top_p: 0.7,
            presence_penalty: 0,
            frequency_penalty: 0.2,
            max_tokens: 128,
            // Completions are capped at 128 tokens. A 4K KV cache adds GPU/unified-memory
            // pressure without improving their quality; a larger agent engine is still reused
            // when it is already loaded.
            contextWindowSize: 1024,
          });

          if (lastRequestRef.current === scheduledRequestId) {
            const cleaned = normalizeCompletion(result, before, after);

            reportDebug(
              createDebugPayload({
                status: cleaned ? 'completed' : 'idle',
                phase: '',
                filePath,
                prompt: scheduledPrompt,
                rawResult: result,
                completion: cleaned,
                error: cleaned ? '' : 'Model returned an empty completion.',
                cursor: { ...activeCursor, index },
                model: actualCompletionModelId,
                completedAt: new Date().toISOString(),
              }),
            );

            if (cleaned) {
              setSuggestion(cleaned);
            }
          }
        } catch (err: unknown) {
          if (lastRequestRef.current !== scheduledRequestId) return;
          if (err instanceof Error && err.name === 'AbortError') return;

          console.error('Completion error:', err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          const modelHint = errorMessage.includes('model')
            ? errorMessage
            : `${errorMessage} (completion model: ${RECOMMENDED_COMPLETION_MODEL.id} — download it from the Prompt panel model manager if needed)`;
          reportDebug(
            createDebugPayload({
              status: 'error',
              phase: '',
              filePath,
              prompt: scheduledPromptForError,
              rawResult: '',
              completion: '',
              error: modelHint,
              cursor: { ...activeCursor, index },
              completedAt: new Date().toISOString(),
            }),
          );
        } finally {
          if (lastRequestRef.current === scheduledRequestId) {
            activeCompletionModelRef.current = null;
            activeCompletionControllerRef.current = null;
          }
          finishRequest();
        }
      },
      process.env.NODE_ENV === 'test' ? 10 : COMPLETION_DEBOUNCE_MS,
    );

    return undefined;
  }, [
    localContent,
    cursorPos,
    filePath,
    enabled,
    clearRequestTimeout,
    invalidateActiveRequest,
    reportDebug,
    setLoading,
    setSuggestion,
    stopThinking,
    selectedModel,
    ragStatus,
  ]);

  const cancelSuggestion = useCallback(
    (options: CancelSuggestionOptions = {}) => {
      if (options.pauseUntilEdit) {
        pausedContentRef.current = lastContentRef.current;
      }
      deferredEditRef.current = null;
      stopThinking({ interrupt: true, report: true });
    },
    [stopThinking],
  );

  const markSuggestionAccepted = useCallback(() => {
    skipNextEditRef.current = true;
  }, []);

  return { suggestion, setSuggestion, cancelSuggestion, loading, markSuggestionAccepted };
}
