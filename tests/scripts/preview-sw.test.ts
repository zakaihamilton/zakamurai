import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const previewWorker = readFileSync(resolve(process.cwd(), 'public/__preview/sw.js'), 'utf8');

describe('preview service worker session routing', () => {
  it('does not fall back to another session for referrer-less dist assets', () => {
    const distRoutingStart = previewWorker.indexOf("if (url.pathname === '/dist'");
    const distRoutingEnd = previewWorker.indexOf(
      'function installPreviewErrorBridge',
      distRoutingStart,
    );
    const distRouting = previewWorker.slice(distRoutingStart, distRoutingEnd);

    expect(distRouting).toContain('if (!sessionId) return;');
    expect(distRouting).not.toContain('[...bridges.values()].at(-1)');
  });

  it('preserves query parameters for session-scoped requests', () => {
    expect(previewWorker).toContain(
      "const path = `${url.pathname.slice(prefix.length) || '/'}${url.search}`;",
    );
  });

  it('pins reconnect postMessage to the stored IDE origin', () => {
    expect(previewWorker).not.toMatch(
      /postMessage\(\{source:'zakamurai-preview',type:'reconnect'[^)]*,'\*'\)/,
    );
    expect(previewWorker).toContain('JSON.stringify(ideOrigin)');
  });

  it('rejects untrusted same-origin init clients when the worker is not root-scoped', () => {
    expect(previewWorker).toContain('function isTrustedPreviewInitClient');
    expect(previewWorker).toContain("path === '/__preview/host'");
    expect(previewWorker).toContain('isMessageSourceOrigin(clientUrl, event.origin)');
    expect(previewWorker).toContain(
      'isTrustedPreviewInitClient(clientUrl, sessionId, event.data.ideOrigin)',
    );
    expect(previewWorker).toContain('existingBridge.workerCapability !== workerCapability');
  });

  it('accepts only capability-bound initialization from the trusted IDE and preview host paths', async () => {
    const worker = createServiceWorkerHarness();
    const fromIde = makeInitEvent({
      sourceUrl: 'https://ide.example.com/',
      ideOrigin: 'https://ide.example.com',
    });
    await dispatchInit(worker, fromIde);
    expect(fromIde.source.postMessage).toHaveBeenCalledWith({
      type: 'init-ok',
      sessionId: 'session-1',
      workerCapability: CAPABILITY_A,
    });

    const hostWorker = createServiceWorkerHarness();
    const fromHostPath = makeInitEvent({
      sourceUrl: 'https://preview.example.com/__preview/host?session=session-1',
    });
    await dispatchInit(hostWorker, fromHostPath);
    expect(fromHostPath.source.postMessage).toHaveBeenCalledWith({
      type: 'init-ok',
      sessionId: 'session-1',
      workerCapability: CAPABILITY_A,
    });

    const rootWorker = createServiceWorkerHarness();
    const fromRootPreviewHost = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
    });
    await dispatchInit(rootWorker, fromRootPreviewHost);
    expect(fromRootPreviewHost.source.postMessage).toHaveBeenCalledWith({
      type: 'init-ok',
      sessionId: 'session-1',
      workerCapability: CAPABILITY_A,
    });
  });

  it('rejects missing, malformed, stale, mismatched, and unauthorized root-scope capabilities', async () => {
    const worker = createServiceWorkerHarness();
    const trustedRoot = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
    });
    await dispatchInit(worker, trustedRoot);
    expect(trustedRoot.source.postMessage).toHaveBeenCalledOnce();

    const staleCapability = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
      capability: CAPABILITY_B,
    });
    await dispatchInit(worker, staleCapability);
    expect(staleCapability.source.postMessage).not.toHaveBeenCalled();

    const unauthorizedRootPage = makeInitEvent({
      sourceUrl: 'https://preview.example.com/untrusted?session=session-1',
    });
    await dispatchInit(worker, unauthorizedRootPage);
    expect(unauthorizedRootPage.source.postMessage).not.toHaveBeenCalled();

    const previewDocument = makeInitEvent({
      sourceUrl: 'https://preview.example.com/__preview/session-1/dist/index.html',
    });
    await dispatchInit(worker, previewDocument);
    expect(previewDocument.source.postMessage).not.toHaveBeenCalled();

    const mismatchedSession = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=other-session',
    });
    await dispatchInit(worker, mismatchedSession);
    expect(mismatchedSession.source.postMessage).not.toHaveBeenCalled();

    const mismatchedOrigin = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
      origin: 'https://attacker.example.com',
    });
    await dispatchInit(worker, mismatchedOrigin);
    expect(mismatchedOrigin.source.postMessage).not.toHaveBeenCalled();

    const missingCapability = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
      includeCapability: false,
    });
    await dispatchInit(worker, missingCapability);
    expect(missingCapability.source.postMessage).not.toHaveBeenCalled();

    const malformedCapability = makeInitEvent({
      sourceUrl: 'https://preview.example.com/?session=session-1',
      capability: 'not-a-capability',
    });
    await dispatchInit(worker, malformedCapability);
    expect(malformedCapability.source.postMessage).not.toHaveBeenCalled();
  });
});

const CAPABILITY_A = 'a'.repeat(64);
const CAPABILITY_B = 'b'.repeat(64);
type InitEventLike = {
  data: Record<string, unknown>;
  ports: Array<{ onmessage?: ((event: unknown) => void) | null }>;
  source: { url: string; postMessage: ReturnType<typeof vi.fn> };
  origin: string;
  waitUntil: (promise: Promise<unknown>) => void;
};
type WorkerHarness = {
  message: (event: InitEventLike) => void;
  claim: ReturnType<typeof vi.fn>;
};

function createServiceWorkerHarness(): WorkerHarness {
  const handlers: Record<string, (event: InitEventLike) => void> = {};
  const claim = vi.fn(async () => undefined);
  const self = {
    addEventListener(type: string, listener: (event: InitEventLike) => void) {
      handlers[type] = listener;
    },
    clients: { claim, matchAll: vi.fn(async () => []) },
    skipWaiting: vi.fn(),
  };
  runInNewContext(previewWorker, {
    self,
    URL,
    Headers,
    Response,
    ReadableStream,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    btoa,
    atob,
    setTimeout,
    clearTimeout,
  });
  const message = handlers.message;
  if (!message) throw new Error('Service worker did not register a message handler');
  return { message, claim };
}

function makeInitEvent({
  sourceUrl,
  origin = new URL(sourceUrl).origin,
  capability = CAPABILITY_A,
  sessionId = 'session-1',
  ideOrigin = 'https://ide.example.com',
  includeCapability = true,
}: {
  sourceUrl: string;
  origin?: string;
  capability?: string;
  sessionId?: string;
  ideOrigin?: string;
  includeCapability?: boolean;
}): InitEventLike {
  const data: Record<string, unknown> = {
    type: 'init',
    sessionId,
    ideOrigin,
  };
  if (includeCapability) data.workerCapability = capability;
  return {
    data,
    ports: [{ onmessage: null }],
    source: { url: sourceUrl, postMessage: vi.fn() },
    origin,
    waitUntil: vi.fn(),
  };
}

async function dispatchInit(worker: WorkerHarness, event: InitEventLike) {
  const waitUntil = event.waitUntil;
  const pending: Promise<unknown>[] = [];
  event.waitUntil = vi.fn((promise) => pending.push(promise));
  worker.message(event);
  await Promise.all(pending);
  event.waitUntil = waitUntil;
}
