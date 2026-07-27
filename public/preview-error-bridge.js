(() => {
  if (window.__zakamuraiPreviewBridge) return;
  window.__zakamuraiPreviewBridge = true;
  const post = (type, message, extra) => {
    // PreviewHost may wrap this document in a nested iframe. Always notify the
    // immediate parent; PreviewHost relays trusted messages to the IDE.
    window.parent.postMessage(
      { source: 'zakamurai-preview', type, message: message || '', ...(extra || {}) },
      '*',
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
