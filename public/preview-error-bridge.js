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
})();
