import type { RefObject } from 'react';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { AlmostnodeContainer } from '@/utils/compiler/types';

export type MockPreviewWindow = {
  postMessage: Mock<(...args: unknown[]) => void>;
};

export function createMockPreviewWindow(): MockPreviewWindow {
  return { postMessage: vi.fn() };
}

export function mockIframeRef(
  contentWindow: MockPreviewWindow | null = null,
): RefObject<HTMLIFrameElement | null> {
  return { current: { contentWindow } as unknown as HTMLIFrameElement };
}

export function mockExternalPreviewRef(
  window: MockPreviewWindow | null = null,
): RefObject<Window | null> {
  return { current: window as unknown as Window };
}

export type MockMessagePort = {
  postMessage: Mock;
  onmessage: ((event: { data: unknown }) => Promise<void> | void) | null;
  close: Mock;
};

export function stubMessageChannel(): { getBridgePort: () => MockMessagePort } {
  let bridgePort: MockMessagePort | undefined;
  vi.stubGlobal(
    'MessageChannel',
    class {
      port1: MockMessagePort;
      port2: MockMessagePort;
      constructor() {
        this.port1 = {
          postMessage: vi.fn(),
          onmessage: null,
          close: vi.fn(),
        };
        this.port2 = { postMessage: vi.fn(), onmessage: null, close: vi.fn() };
        bridgePort = this.port1;
      }
    },
  );
  return {
    getBridgePort: () => {
      if (!bridgePort) throw new Error('MessageChannel not initialized');
      return bridgePort;
    },
  };
}

type ServerBridgeWithHandleRequest = {
  initServiceWorker?: (options: { swUrl: string }) => Promise<void>;
  registerServer?: (server: unknown, port: number) => void;
  handleRequest?: Mock;
};

export function mockCompilerContainer(
  serverBridge: ServerBridgeWithHandleRequest | null,
): AlmostnodeContainer {
  return { serverBridge } as unknown as AlmostnodeContainer;
}

export function asPreviewDocument(partial: Record<string, unknown>): Document {
  return partial as unknown as Document;
}

export function asPartialError(overrides: { stack?: string; message?: string }): Error {
  return overrides as Error;
}

export function asFetchImpl(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>,
): typeof fetch {
  return impl as unknown as typeof fetch;
}
