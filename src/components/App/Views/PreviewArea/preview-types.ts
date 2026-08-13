import type { StateStore } from '@/components/state/types';
import type { PreviewAreaUiStateShape, PreviewStateShape } from '@/types/domain-types';
import type { RefObject } from 'react';
import type { PreviewOrigins } from './previewOrigins';

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

export type PreviewMessage = {
  source?: string;
  type: string;
  message?: string;
  path?: string;
  title?: string;
  text?: string;
  elements?: string[];
  screenshotCaptured?: boolean;
  screenshot?: string;
  styleAudit?: PreviewStyleAudit;
};

export type PreviewStyleAudit = {
  horizontalOverflow: boolean;
  collapsedControls: string[];
  missingExplicitColors: string[];
  contrastFailures: string[];
  unnamedControls: string[];
  missingFocusVisible: boolean;
  issues: string[];
};

export type PreviewEvidence = {
  path?: string;
  title?: string;
  text?: string;
  elements?: string[];
  screenshotCaptured?: boolean;
  screenshot?: string;
  styleAudit?: PreviewStyleAudit;
};

export type PreviewErrorActionsProps = {
  copied: boolean;
  onCopy: () => void;
  onDismiss: () => void;
};

export type PreviewErrorBannerProps = {
  displayError: string | null;
  errorCopied: boolean;
  onCopyError: () => void;
  onDismissError: () => void;
};

export type PreviewErrorStateProps = {
  title: string;
  message: string;
  copied?: boolean;
  onCopy?: () => void;
  onDismiss?: () => void;
};

export type PreviewIframeContainerProps = {
  isLoading: boolean;
  hasLoadedOnce: boolean;
  showInitOverlay: boolean;
  displayError: string | null;
  errorCopied: boolean;
  onCopyError: () => void;
  onDismissError: () => void;
  scale: number;
  isCompilerReady: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  previewUrl: string | null;
  previewSessionId: string | null;
  refreshKey?: number;
  onLoad: () => void;
};

export type PreviewToolbarProps = {
  previewHostLabel: string;
  isLoading: boolean;
  scale: number;
  isMaximized: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onRefresh: () => void;
  onOpenExternal: () => void;
  onToggleMaximize: () => void;
};

export type UsePreviewRuntimeBridgeParams = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  previewAreaUiState: StateStore<PreviewAreaUiStateShape>;
  previewUrl: string | null;
  previewOrigin: string;
  setPreviewError: (message: string) => void;
  setHasLoadedOnce: (value: boolean) => void;
};

export type UsePreviewSessionLifecycleParams = {
  previewSessionId: string | null;
  htmlContent: string | null;
  previewAddress: string;
  previewState: StateStore<PreviewStateShape>;
  previewAreaUiState: StateStore<PreviewAreaUiStateShape>;
  origins: PreviewOrigins;
  refreshKey: number;
  address: string;
  onBlockedExternalPreview: (message: string) => void;
};

export type PreviewIframeListeners = {
  win: Window;
  onError: (event: ErrorEvent) => void;
  onRejection: (event: PromiseRejectionEvent) => void;
};
