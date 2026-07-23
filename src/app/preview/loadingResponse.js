export function createPreviewLoadingResponse() {
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Preview Loading...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
    .container { text-align: center; padding: 2rem; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.15); border-top-color: #6c63ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 0.5rem; font-weight: 500; }
    p { color: #888; font-size: 0.9rem; margin: 0; }
    #status { margin-top: 1rem; font-size: 0.8rem; color: #666; white-space: pre-line; }
  </style>
</head>
<body>
  <div class="container"><div class="spinner"></div><h2>Preview Loading</h2><p>Waiting for the preview service worker to initialize...</p><div id="status"></div></div>
  <script>
    const statusEl = document.getElementById('status');
    const maxAttempts = 20;
    const WAIT_PARAM = '_preview_wait';

    // Opaque sandboxed iframes (no allow-same-origin) throw SecurityError on
    // navigator.serviceWorker access — never read it without try/catch.
    function getServiceWorker() {
      try {
        return 'serviceWorker' in navigator ? navigator.serviceWorker : null;
      } catch (_e) {
        return null;
      }
    }

    function readAttempts() {
      try {
        var n = parseInt(new URL(location.href).searchParams.get(WAIT_PARAM) || '0', 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch (_e) {
        return 0;
      }
    }

    function reloadWithAttempt(next) {
      try {
        var url = new URL(location.href);
        url.searchParams.set(WAIT_PARAM, String(next));
        location.replace(url.toString());
      } catch (_e) {
        location.reload();
      }
    }

    function scheduleReload() {
      statusEl.textContent = 'Service worker active, reloading...';
      setTimeout(function () { location.reload(); }, 300);
    }

    function giveUp(hasSw) {
      statusEl.textContent = hasSw
        ? 'Service worker did not activate.\\nPlease go back and compile your project first.'
        : 'Preview is still loading.\\nPlease go back and compile your project first.';
    }

    function checkAndReload() {
      var attempts = readAttempts() + 1;
      statusEl.textContent = 'Attempt ' + attempts + '/' + maxAttempts + '...';
      var sw = getServiceWorker();
      if (sw && sw.controller) {
        scheduleReload();
        return;
      }
      if (attempts >= maxAttempts) {
        giveUp(!!sw);
        return;
      }
      // Without SW access (sandboxed preview), reload so the parent SW can
      // eventually intercept this navigation once it is controlling.
      // Attempt count lives in the URL so it survives full document reloads.
      if (!sw) {
        setTimeout(function () { reloadWithAttempt(attempts); }, 500);
        return;
      }
      setTimeout(checkAndReload, 500);
    }

    var sw = getServiceWorker();
    if (sw) {
      sw.ready.then(function () {
        if (sw.controller) scheduleReload();
        else {
          sw.addEventListener('controllerchange', function () { scheduleReload(); }, { once: true });
          checkAndReload();
        }
      });
      setTimeout(checkAndReload, 1000);
    } else {
      statusEl.textContent = 'Sandbox preview — retrying until the host service worker intercepts...';
      setTimeout(checkAndReload, 1000);
    }
  </script>
</body>
</html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}
