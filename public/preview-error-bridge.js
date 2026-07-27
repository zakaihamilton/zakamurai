(() => {
  if (window.__zakamuraiPreviewBridge) return;
  window.__zakamuraiPreviewBridge = true;
  const targetOrigin = window.__zakamuraiPreviewParentOrigin;
  if (!targetOrigin) return;
  const post = (type, message, extra) => {
    window.parent.postMessage(
      { source: 'zakamurai-preview', type, message: message || '', ...(extra || {}) },
      targetOrigin,
    );
  };
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
  post('navigate', '', { path: location.pathname || '/' });
  try {
    setTimeout(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000);
      const elements = Array.prototype.slice
        .call(document.querySelectorAll('h1,h2,h3,button,a,input,[role]'), 0, 80)
        .map((el) => {
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const label = el.getAttribute('aria-label') || el.innerText || el.value || '';
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
            canvas.getContext('2d').drawImage(image, 0, 0);
            const screenshot = canvas.toDataURL('image/png');
            if (screenshot.length < 500000)
              post('evidence', '', {
                path: location.pathname || '',
                title: document.title || '',
                text,
                elements,
                screenshotCaptured: true,
                screenshot,
              });
          } catch (_captureError) {}
        };
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      } catch (_captureSetupError) {}
    }, 250);
  } catch (_e) {}
})();
