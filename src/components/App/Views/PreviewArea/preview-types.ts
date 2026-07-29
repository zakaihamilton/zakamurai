import type { RefObject } from 'react';

export type PreviewSurfaceKind = 'iframe' | 'external';

export type PreviewConnectMessage = {
  type: string;
  version?: number;
  sessionId?: string;
  surface?: PreviewSurfaceKind;
};

export type PreviewRequestMessage = {
  type: string;
  sessionId: string;
  id: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  streaming?: boolean;
};

export type PreviewResponsePayload = {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Uint8Array;
};

export type PreviewBridgeProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  externalPreviewRef?: RefObject<Window | null>;
  externalPreviewNonce?: number;
  iframeHandshakeNonce?: number;
  sessionId: string;
  previewOrigin: string;
  onError?: (message: string) => void;
};

export type PreviewSurfaceProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  isMaximized: boolean;
  previewHostLabel: string;
  isLoading: boolean;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onRefresh: () => void;
  onOpenExternal: () => void;
  onToggleMaximize: () => void;
  hasLoadedOnce: boolean;
  showInitOverlay: boolean;
  displayError: string | null;
  errorCopied: boolean;
  onCopyError: () => void;
  onDismissError: () => void;
  isCompilerReady: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  previewIframeUrl: string | null;
  sessionId: string | null;
  refreshKey: number;
  onLoad: () => void;
  externalPreviewRef: RefObject<Window | null>;
  externalPreviewNonce: number;
  previewOrigin: string;
  onError: (message: string) => void;
};

export type EsbuildTransformError = {
  message?: string;
  errors?: Array<{
    location?: { file?: string; filePath?: string; line?: number; column?: number };
    text?: string;
    message?: string;
  }>;
  cause?: { errors?: EsbuildTransformError['errors'] };
};
