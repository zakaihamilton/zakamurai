import type { WebLLMGenerationMetrics, WebLLMRecoveryReason } from '@/components/AI/types';

export type CompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  extra?: {
    decode_tokens_per_s?: number;
    time_to_first_token_s?: number;
  };
};

export type CompletionChoice = {
  message?: { content?: string };
  delta?: { content?: string };
  finish_reason?: string | null;
};

export type CompletionResponse = {
  choices?: CompletionChoice[];
  usage?: CompletionUsage | null;
};

export type WebLLMEngine = {
  interruptSignal?: boolean;
  resetChat: (keepStats?: boolean, modelId?: string) => Promise<void>;
  interruptGenerate: () => void | Promise<void>;
  unload?: () => Promise<void>;
  worker?: { terminate?: () => void };
  asyncGenerate?: (selectedModelId: string) => AsyncGenerator<CompletionResponse, void, void>;
  getPromise?: (message: unknown) => Promise<unknown>;
  chat: {
    completions: {
      create: (options: Record<string, unknown>) => Promise<CompletionResponse>;
    };
  };
};

export type EngineRecord = {
  modelId: string;
  contextWindowSize: number;
  promise: Promise<WebLLMEngine>;
};

export type ActiveGeneration = {
  requestId: number;
  modelId: string;
  engine: WebLLMEngine;
  done: Promise<void>;
  resolveDone: () => void;
};

export type PendingRequest = {
  requestedModelId: string;
  controller: AbortController;
};

export type SessionFallback = {
  modelId: string;
  reason: WebLLMRecoveryReason;
  expiresAt: number;
};

export type AttemptResult = {
  text: string;
  modelId: string;
  initializationMs?: number;
  localTimeToFirstTokenMs?: number;
  usage?: CompletionUsage | null;
  finishReason?: string | null;
  sessionState?: WebLLMGenerationMetrics['sessionState'];
  submittedDeltaBytes?: number;
  submittedDeltaTokens?: number;
  reusedContextTokens?: number;
};
