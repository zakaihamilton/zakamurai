/**
 * Fallback route for /preview/* requests.
 *
 * When the Service Worker is active, it intercepts requests to /preview/*
 * and serves content from the virtual filesystem. This server-side route
 * only runs when the SW hasn't intercepted the request (e.g., on first load
 * before the SW is installed, or if the SW fails to activate).
 *
 * It returns a lightweight HTML page that waits for the SW to become ready,
 * then reloads itself so the SW can serve the actual preview content.
 */
export async function GET(_request) {
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Preview Loading...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #1a1a2e;
      color: #e0e0e0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: #6c63ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 0.5rem; font-weight: 500; }
    p { color: #888; font-size: 0.9rem; margin: 0; }
    #status { margin-top: 1rem; font-size: 0.8rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Preview Loading</h2>
    <p>Waiting for the preview service worker to initialize...</p>
    <div id="status"></div>
  </div>
  <script>
    const statusEl = document.getElementById('status');
    let attempts = 0;
    const maxAttempts = 20;

    function checkAndReload() {
      attempts++;
      statusEl.textContent = 'Attempt ' + attempts + '/' + maxAttempts + '...';

      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        statusEl.textContent = 'Service worker active, reloading...';
        setTimeout(() => location.reload(), 300);
        return;
      }

      if (attempts >= maxAttempts) {
        statusEl.innerHTML = 'Service worker did not activate.<br>Please go back and compile your project first.';
        return;
      }

      setTimeout(checkAndReload, 500);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        // SW is ready, but might not be controlling this page yet
        if (navigator.serviceWorker.controller) {
          location.reload();
        } else {
          // Wait for controller
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            location.reload();
          }, { once: true });
          // Also poll as a fallback
          checkAndReload();
        }
      });
      // Start polling immediately in case .ready takes a while
      setTimeout(checkAndReload, 1000);
    } else {
      statusEl.textContent = 'Service Workers are not supported in this browser.';
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
