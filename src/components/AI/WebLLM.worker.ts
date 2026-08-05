import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';
import { ensureSystemMessageFirst } from './WebLLMMessageUtils';

type SessionMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type SessionRequest = {
  operation: 'start' | 'append' | 'rehydrate' | 'dispose';
  sessionId: string;
  messages?: SessionMessage[];
  modelId?: string[];
  chatOpts?: unknown[];
  generation?: Record<string, unknown>;
};

const normalizeMessages = (messages: SessionMessage[] | null | undefined): SessionMessage[] =>
  ensureSystemMessageFirst(
    (Array.isArray(messages) ? messages : []).filter(
      (message): message is SessionMessage =>
        Boolean(message) &&
        (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string',
    ),
  );

/**
 * Keeps the canonical conversation in the inference worker. The UI therefore sends
 * only a bootstrap or delta, while WebLLM still receives the complete conversation
 * locally where it can reuse its native KV cache.
 */
class SessionWorkerHandler extends WebWorkerMLCEngineHandler {
  private readonly sessions = new Map<string, SessionMessage[]>();

  override onmessage(event: MessageEvent): void {
    const message = event?.data;
    if (message?.kind !== 'customRequest' || message.content?.requestName !== 'agent-session') {
      super.onmessage(event);
      return;
    }

    const request = JSON.parse(message.content.requestMessage) as SessionRequest;
    this.handleTask(message.uuid, async () => {
      if (request.operation === 'dispose') {
        this.sessions.delete(request.sessionId);
        this.loadedModelIdToAsyncGenerator.delete(request.sessionId);
        return null;
      }

      if (request.operation === 'start' || request.operation === 'rehydrate') {
        this.sessions.set(request.sessionId, normalizeMessages(request.messages));
        await this.engine.resetChat(false);
      } else if (request.operation === 'append') {
        const current = this.sessions.get(request.sessionId);
        if (!current) throw new Error(`Unknown agent session: ${request.sessionId}`);
        this.sessions.set(
          request.sessionId,
          ensureSystemMessageFirst([...current, ...normalizeMessages(request.messages)]),
        );
      }

      const messages = this.sessions.get(request.sessionId);
      if (!messages) throw new Error(`Unknown agent session: ${request.sessionId}`);
      await this.reloadIfUnmatched(
        request.modelId || this.modelId || [],
        request.chatOpts as never,
      );
      const stream = await this.engine.chatCompletion({
        messages,
        stream: true,
        ...(request.generation || {}),
      } as never);
      const tracked = this.trackAssistantReply(
        request.sessionId,
        stream as unknown as AsyncIterable<unknown>,
      );
      this.loadedModelIdToAsyncGenerator.set(request.sessionId, tracked as never);
      return null;
    });
  }

  private async *trackAssistantReply(
    sessionId: string,
    stream: AsyncIterable<unknown>,
  ): AsyncGenerator<unknown, void, void> {
    let output = '';
    try {
      for await (const chunk of stream) {
        const value = chunk as { choices?: Array<{ delta?: { content?: string } }> };
        output += value.choices?.[0]?.delta?.content || '';
        yield chunk;
      }
      if (output) this.sessions.get(sessionId)?.push({ role: 'assistant', content: output });
    } finally {
      this.loadedModelIdToAsyncGenerator.delete(sessionId);
    }
  }
}

// Keep model loading and inference off the UI thread.
const handler = new SessionWorkerHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
