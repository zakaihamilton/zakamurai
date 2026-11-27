(() => {
  if (window.__zakamuraiPreviewBridge) return;
  window.__zakamuraiPreviewBridge = true;

  const script = document.currentScript;
  const encodedOrigin = script?.getAttribute('data-ide-origin') || '';
  let targetOrigin = '';
  try {
    const candidate = decodeURIComponent(encodedOrigin);
    const parsed = new URL(candidate);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.origin === candidate
    ) {
      targetOrigin = parsed.origin;
    }
  } catch {
    targetOrigin = '';
  }
  if (!targetOrigin) return;

  window.__zakamuraiPreviewParentOrigin = targetOrigin;
  const post = (type, message, extra) => {
    window.parent.postMessage(
      { source: 'zakamurai-preview', type, message: message || '', ...(extra || {}) },
      targetOrigin,
    );
  };

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        form.hasAttribute('action') ||
        (form.target && form.target !== '_self')
      ) {
        return;
      }
      const reactPropsKey = Object.keys(form).find((key) => key.startsWith('__reactProps$'));
      const reactHandlersKey = Object.keys(form).find((key) =>
        key.startsWith('__reactEventHandlers$'),
      );
      const props = form[reactPropsKey] || form[reactHandlersKey];
      if (typeof props?.onSubmit === 'function' || typeof props?.onSubmitCapture === 'function') {
        event.preventDefault();
      }
    },
    true,
  );

  window.addEventListener(
    'error',
    (event) => {
      let message = event?.message || 'Script error';
      if (event?.filename) message += ` at ${event.filename}:${event.lineno || 0}`;
      post('runtime-error', message);
    },
    true,
  );
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    post('unhandled-rejection', reason?.message || String(reason || 'Unhandled rejection'));
  });
  let inspectActive = false;
  let highlightElement = null;
  const clearHighlight = () => {
    highlightElement?.remove();
    highlightElement = null;
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.origin !== targetOrigin) return;
    if (event.data?.source === 'zakamurai-preview' && event.data.type === 'toggle-inspect') {
      inspectActive = Boolean(event.data.active);
      document.body.style.cursor = inspectActive ? 'crosshair' : '';
      if (!inspectActive) clearHighlight();
    }
  });
  window.addEventListener(
    'mousemove',
    (event) => {
      if (!inspectActive) return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target === document.body ||
        target === document.documentElement
      )
        return;
      const rect = target.getBoundingClientRect();
      if (!highlightElement) {
        highlightElement = document.createElement('div');
        highlightElement.style.cssText =
          'position:fixed;pointer-events:none;z-index:999999;border:2px solid #3b82f6;background:rgba(59,130,246,0.12);border-radius:4px;transition:all 0.05s ease;';
        document.body.appendChild(highlightElement);
      }
      highlightElement.style.top = `${rect.top}px`;
      highlightElement.style.left = `${rect.left}px`;
      highlightElement.style.width = `${rect.width}px`;
      highlightElement.style.height = `${rect.height}px`;
    },
    true,
  );
  window.addEventListener(
    'click',
    (event) => {
      if (!inspectActive) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.target;
      inspectActive = false;
      document.body.style.cursor = '';
      clearHighlight();
      if (target instanceof Element) {
        const className =
          typeof target.className === 'string' ? target.className.trim().slice(0, 120) : '';
        const elementText = String(
          target.innerText || target.textContent || target.getAttribute('aria-label') || '',
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 140);
        post('element-picked', '', {
          tagName: target.tagName.toLowerCase(),
          className,
          elementText,
        });
      }
    },
    true,
  );

  post('navigate', '', { path: location.pathname || '/' });
  window.setTimeout(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000);
    const elements = Array.from(document.querySelectorAll('h1,h2,h3,button,a,input,[role]'))
      .slice(0, 80)
      .map((element) => {
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const label =
          element.getAttribute('aria-label') || element.innerText || element.value || '';
        return `${role}: ${label}`.replace(/\s+/g, ' ').slice(0, 160);
      })
      .filter(Boolean);
    post('evidence', '', {
      path: location.pathname || '',
      title: document.title || '',
      text,
      elements,
      screenshotCaptured: false,
    });

    try {
      const markup = new XMLSerializer().serializeToString(document.documentElement);
      const encodedMarkup = markup.replace(/&/g, '&amp;').replace(/#/g, '%23');
      const width = Math.min(window.innerWidth, 1440);
      const height = Math.min(window.innerHeight, 1200);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject width="100%" height="100%">${encodedMarkup}</foreignObject></svg>`;
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(image, 0, 0);
          const screenshot = canvas.toDataURL('image/png');
          if (screenshot.length < 500000) {
            post('evidence', '', {
              path: location.pathname || '',
              title: document.title || '',
              text,
              elements,
              screenshotCaptured: true,
              screenshot,
            });
          }
        } catch {
          // Screenshot evidence is optional; keep runtime reporting available.
        }
      };
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      // Screenshot evidence is optional; keep runtime reporting available.
    }
  }, 250);
})();
