import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewWorker = readFileSync(resolve(process.cwd(), 'public/__preview/sw.js'), 'utf8');

describe('preview service worker session routing', () => {
  it('does not fall back to another session for referrer-less dist assets', () => {
    const distRoutingStart = previewWorker.indexOf("if (url.pathname === '/dist'");
    const distRoutingEnd = previewWorker.indexOf(
      'function installPreviewErrorBridge',
      distRoutingStart,
    );
    const distRouting = previewWorker.slice(distRoutingStart, distRoutingEnd);

    expect(distRouting).toContain('if (!sessionId) return;');
    expect(distRouting).not.toContain('[...bridges.values()].at(-1)');
  });

  it('preserves query parameters for session-scoped requests', () => {
    expect(previewWorker).toContain(
      "const path = `${url.pathname.slice(prefix.length) || '/'}${url.search}`;",
    );
  });

  it('pins reconnect postMessage to the stored IDE origin', () => {
    expect(previewWorker).not.toMatch(
      /postMessage\(\{source:'zakamurai-preview',type:'reconnect'[^)]*,'\*'\)/,
    );
    expect(previewWorker).toContain('JSON.stringify(ideOrigin)');
  });

  it('rejects untrusted same-origin init clients when the worker is not root-scoped', () => {
    expect(previewWorker).toContain('function isTrustedPreviewInitClient');
    expect(previewWorker).toContain("path === '/__preview/host'");
    expect(previewWorker).toContain(
      'if (!isTrustedPreviewInitClient(clientUrl, sessionId)) return',
    );
  });
});
