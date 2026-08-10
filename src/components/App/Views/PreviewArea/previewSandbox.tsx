/** Message protocol for sandboxed preview → parent runtime errors. */
import { isPreviewMessageShape } from '@/contracts/preview';
import type { PreviewMessage, PreviewStyleAudit } from './preview-types';

export const PREVIEW_MESSAGE_SOURCE = 'zakamurai-preview';

export const PREVIEW_MESSAGE_TYPES = {
  RUNTIME_ERROR: 'runtime-error',
  UNHANDLED_REJECTION: 'unhandled-rejection',
  NAVIGATE: 'navigate',
  EVIDENCE: 'evidence',
  RECONNECT: 'reconnect',
} as const;

/**
 * Preview iframe sandbox tokens.
 *
 * Configured production previews are hosted on a different origin and use their
 * own scoped service worker. `allow-same-origin` preserves that distinct preview
 * origin so its service worker and exact-origin message checks can operate. The
 * unconfigured Vercel compatibility surface intentionally shares the deployment
 * origin and therefore has weaker isolation.
 */
export const PREVIEW_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';

type PreviewStyleEvidence = { elements: string[]; styleAudit: PreviewStyleAudit };

/** Collects the same computed evidence in tests and in the injected preview bridge. */
export function collectPreviewStyleEvidence(
  previewDocument: Document,
  previewWindow: Window,
): PreviewStyleEvidence {
  const accessibleName = (element: Element): string => {
    const control = element as HTMLElement & {
      labels?: NodeListOf<HTMLLabelElement>;
      value?: string;
    };
    const labelledBy = String(element.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const label = previewDocument.getElementById(id);
        return label?.innerText || label?.textContent || '';
      })
      .join(' ');
    const labels = control.labels
      ? Array.from(control.labels)
          .map((label) => label.innerText || label.textContent || '')
          .join(' ')
      : '';
    const image = element.querySelector?.('img[alt]');
    return String(
      element.getAttribute('aria-label') ||
        labelledBy ||
        labels ||
        control.innerText ||
        control.textContent ||
        control.value ||
        element.getAttribute('title') ||
        image?.getAttribute('alt') ||
        '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  };
  const elements = Array.from(
    previewDocument.querySelectorAll(
      'main,nav,header,footer,h1,h2,h3,button,a,input,select,textarea,[role]',
    ),
  )
    .slice(0, 80)
    .map(
      (element) =>
        `${element.getAttribute('role') || element.tagName.toLowerCase()}: ${accessibleName(element)}`,
    )
    .filter(Boolean);
  const controls = Array.from(
    previewDocument.querySelectorAll('button,a,input,select,textarea,[role="button"]'),
  ).slice(0, 80);
  const collapsedControls: string[] = [];
  const unnamedControls: string[] = [];
  for (const element of controls) {
    const rect = element.getBoundingClientRect();
    const style = previewWindow.getComputedStyle(element);
    const accessible = accessibleName(element);
    const name = accessible || element.tagName.toLowerCase();
    if (
      rect.width < 24 ||
      rect.height < 24 ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) {
      collapsedControls.push(name);
    }
    if (!accessible) unnamedControls.push(element.tagName.toLowerCase());
  }
  const rgb = (value: string): number[] | null => {
    const parts = String(value || '').match(/[\d.]+/g);
    return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
  };
  const luminance = (color: string): number | null => {
    const value = rgb(color);
    if (!value) return null;
    const channels = value.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrastFailures: string[] = [];
  for (const element of Array.from(
    previewDocument.querySelectorAll('body,h1,h2,h3,p,label,button,input,select,textarea'),
  ).slice(0, 80)) {
    const style = previewWindow.getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    if (
      foreground !== null &&
      background !== null &&
      style.backgroundColor !== 'rgba(0, 0, 0, 0)'
    ) {
      const ratio =
        (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      if (ratio < 3)
        contrastFailures.push(`${element.tagName.toLowerCase()} ${ratio.toFixed(2)}:1`);
    }
  }
  const root = previewDocument.getElementById('root');
  const pageSurfaces = [
    previewDocument.documentElement,
    previewDocument.body,
    root,
    root?.firstElementChild,
    previewDocument.querySelector('main,[role="main"]'),
  ].filter((element): element is Element => Boolean(element));
  const inlineStyle = (element: Element): CSSStyleDeclaration | null =>
    element instanceof HTMLElement ? element.style : null;
  let hasExplicitForeground = pageSurfaces.some((element) => Boolean(inlineStyle(element)?.color));
  let hasExplicitBackground = pageSurfaces.some((element) => {
    const style = inlineStyle(element);
    return Boolean(style?.background || style?.backgroundColor);
  });
  const focusSelectors: string[] = [];
  const matchesSurface = (selector: string): boolean =>
    pageSurfaces.some((element) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
  const scanRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule & { cssRules?: CSSRuleList };
      const selector = String(styleRule.selectorText || '');
      if (selector.includes(':focus-visible')) {
        for (const part of selector.split(',')) {
          if (part.includes(':focus-visible')) {
            focusSelectors.push(part.replace(/:focus-visible/g, '').trim());
          }
        }
      }
      if (selector && styleRule.style && matchesSurface(selector)) {
        if (styleRule.style.getPropertyValue('color')) hasExplicitForeground = true;
        if (
          styleRule.style.getPropertyValue('background') ||
          styleRule.style.getPropertyValue('background-color')
        ) {
          hasExplicitBackground = true;
        }
      }
      if (styleRule.cssRules) scanRules(styleRule.cssRules);
    }
  };
  for (const sheet of Array.from(previewDocument.styleSheets)) {
    try {
      scanRules(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets can be unreadable; continue with accessible sheets.
    }
  }
  const missingExplicitColors = [
    ...(!hasExplicitForeground ? ['page foreground'] : []),
    ...(!hasExplicitBackground ? ['page background'] : []),
  ];
  const missingFocusVisible = controls.some(
    (element) =>
      !focusSelectors.some((selector) => {
        try {
          return element.matches(selector);
        } catch {
          return false;
        }
      }),
  );
  const horizontalOverflow =
    previewDocument.documentElement.scrollWidth > previewWindow.innerWidth + 1 ||
    previewDocument.body.scrollWidth > previewWindow.innerWidth + 1;
  const issues = [
    ...(horizontalOverflow ? ['horizontal overflow'] : []),
    ...(collapsedControls.length ? ['collapsed controls'] : []),
    ...(missingExplicitColors.length ? ['missing explicit colors'] : []),
    ...(contrastFailures.length ? ['contrast below 3:1'] : []),
    ...(unnamedControls.length ? ['unnamed controls'] : []),
    ...(missingFocusVisible ? ['missing focus-visible rules'] : []),
  ];
  return {
    elements,
    styleAudit: {
      horizontalOverflow,
      collapsedControls: collapsedControls.slice(0, 20),
      missingExplicitColors,
      contrastFailures: contrastFailures.slice(0, 20),
      unnamedControls: unnamedControls.slice(0, 20),
      missingFocusVisible,
      issues,
    },
  };
}

/**
 * Inline script injected into preview HTML so runtime errors still reach the parent
 * when same-origin DOM access is unavailable (defense in depth alongside SW injection).
 */
export const PREVIEW_ERROR_BRIDGE_SCRIPT = `(function(){
  if (window.__zakamuraiPreviewBridge) return;
  window.__zakamuraiPreviewBridge = true;
  var SRC = ${JSON.stringify(PREVIEW_MESSAGE_SOURCE)};
  function post(type, message, extra) {
    try {
      parent.postMessage(Object.assign({ source: SRC, type: type, message: message || '' }, extra || {}), '*');
    } catch (_e) {}
  }
  window.addEventListener('error', function (event) {
    var msg = event && event.message ? event.message : 'Script error';
    if (event && event.filename) msg += ' at ' + event.filename + ':' + (event.lineno || 0);
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR)}, msg);
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var msg = reason && reason.message ? reason.message : String(reason || 'Unhandled rejection');
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION)}, msg);
  });
  try {
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.NAVIGATE)}, '', { path: location.pathname || '' });
    setTimeout(function () {
      var text = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 4000);
      var auditEvidence = (${collectPreviewStyleEvidence.toString()})(document, window);
      var elements = auditEvidence.elements;
      var styleAudit = auditEvidence.styleAudit;
      post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.EVIDENCE)}, '', { path: location.pathname || '', title: document.title || '', text: text, elements: elements, styleAudit: styleAudit, screenshotCaptured: false });
      try {
        var markup = new XMLSerializer().serializeToString(document.documentElement);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.min(window.innerWidth, 1440) + '" height="' + Math.min(window.innerHeight, 1200) + '"><foreignObject width="100%" height="100%">' + markup.replace(/&/g, '&amp;').replace(/#/g, '%23') + '</foreignObject></svg>';
        var image = new Image();
        image.onload = function () {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = Math.min(window.innerWidth, 1440); canvas.height = Math.min(window.innerHeight, 1200);
            canvas.getContext('2d').drawImage(image, 0, 0);
            var screenshot = canvas.toDataURL('image/png');
            if (screenshot.length < 500000) post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.EVIDENCE)}, '', { path: location.pathname || '', title: document.title || '', text: text, elements: elements, styleAudit: styleAudit, screenshotCaptured: true, screenshot: screenshot });
          } catch (_captureError) {}
        };
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (_captureSetupError) {}
    }, 250);
  } catch (_e) {}
})();`;

export function injectPreviewErrorBridge(html: string) {
  if (typeof html !== 'string' || !html) return html;
  if (html.includes('__zakamuraiPreviewBridge')) return html;
  const scriptTag = `<script>${PREVIEW_ERROR_BRIDGE_SCRIPT}</script>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${scriptTag}</head>`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptTag}</body>`);
  }
  return `${html}${scriptTag}`;
}

export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (!isPreviewMessageShape(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (
    !Object.values(PREVIEW_MESSAGE_TYPES).includes(
      record.type as (typeof PREVIEW_MESSAGE_TYPES)[keyof typeof PREVIEW_MESSAGE_TYPES],
    )
  ) {
    return null;
  }
  const parsed: PreviewMessage = {
    source: String(record.source || ''),
    type: String(record.type),
    message: record.message == null ? '' : String(record.message),
    path: record.path == null ? undefined : String(record.path),
  };
  if (record.type === PREVIEW_MESSAGE_TYPES.EVIDENCE) {
    parsed.title = record.title == null ? '' : String(record.title).slice(0, 300);
    parsed.text = record.text == null ? '' : String(record.text).slice(0, 4000);
    parsed.elements = Array.isArray(record.elements)
      ? record.elements.slice(0, 80).map(String)
      : [];
    parsed.screenshotCaptured = Boolean(record.screenshotCaptured);
    parsed.screenshot =
      typeof record.screenshot === 'string' && record.screenshot.startsWith('data:image/')
        ? record.screenshot.slice(0, 500000)
        : '';
    if (record.styleAudit && typeof record.styleAudit === 'object') {
      const audit = record.styleAudit as Record<string, unknown>;
      parsed.styleAudit = {
        horizontalOverflow: audit.horizontalOverflow === true,
        collapsedControls: Array.isArray(audit.collapsedControls)
          ? audit.collapsedControls.slice(0, 20).map(String)
          : [],
        missingExplicitColors: Array.isArray(audit.missingExplicitColors)
          ? audit.missingExplicitColors.slice(0, 20).map(String)
          : [],
        contrastFailures: Array.isArray(audit.contrastFailures)
          ? audit.contrastFailures.slice(0, 20).map(String)
          : [],
        unnamedControls: Array.isArray(audit.unnamedControls)
          ? audit.unnamedControls.slice(0, 20).map(String)
          : [],
        missingFocusVisible: audit.missingFocusVisible === true,
        issues: Array.isArray(audit.issues) ? audit.issues.slice(0, 20).map(String) : [],
      };
    }
  }
  return parsed;
}

/**
 * Allow only same-app preview paths. Reject absolute URLs, protocol-relative,
 * traversal (including encoded forms), and anything outside a `/preview` namespace.
 */
export function sanitizePreviewPath(path: string): string | null {
  if (typeof path !== 'string' || !path) return null;
  let trimmed = path.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded === trimmed) break;
      trimmed = decoded;
      if (attempt === 3) return null;
    } catch {
      return null;
    }
  }

  if (trimmed.includes('\\') || trimmed.includes('..')) return null;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (!/^(?:\/[^/]+)*\/preview(?:\/.*)?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Accept preview bridge messages only from the preview iframe window.
 * Same-origin previews must match the IDE origin; opaque frames report "null".
 */
export function isTrustedPreviewMessage(
  event: MessageEvent,
  iframeWindow: Window | null | undefined,
  trustedOrigin: string | null = null,
) {
  if (!event || !iframeWindow) return false;
  if (event.source !== iframeWindow) return false;
  const origin = event.origin;
  if (origin && origin !== 'null') {
    if (trustedOrigin) {
      if (origin !== trustedOrigin) return false;
    } else if (typeof window !== 'undefined' && origin !== window.location.origin) {
      return false;
    }
  }
  return !!parsePreviewMessage(event.data);
}
