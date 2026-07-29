import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Keep model loading and inference off the UI thread.
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
