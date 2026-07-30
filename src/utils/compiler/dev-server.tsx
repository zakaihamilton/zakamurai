/**
 * Custom Vite Dev Server with CSS Module support.
 */

import { reportPreviewError } from '@/components/App/Views/PreviewArea/previewErrorBridge';
import {
  createTransformErrorResponse,
  extractTransformErrorFromResponse,
  formatEsbuildTransformError,
} from '@/components/App/Views/PreviewArea/previewErrorUtils';
import { ALMOSTNODE_RUNTIME_URL } from './almostnode';
export { buildCssModuleJavaScript, simpleHash } from './css-modules';
import { buildCssModuleJavaScript } from './css-modules';
import type { AlmostnodeContainer, OnLog, VfsLike } from './types';

type DevServerResponse = {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Uint8Array;
};

type ViteDevServerInstance = {
  vfs: VfsLike;
  transformCode(content: string, urlPath: string): Promise<void>;
  handleRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<DevServerResponse>;
  resolvePath(pathname: string): string;
  exists(filePath: string): boolean;
  isDirectory(filePath: string): boolean;
  serveFile(filePath: string): DevServerResponse;
  notFound(pathname: string): DevServerResponse;
  serverError(error: unknown): DevServerResponse;
};

export async function setupSmartDevServer(
  container: AlmostnodeContainer,
  onLog: OnLog,
): Promise<void> {
  const nativeImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{
    ViteDevServer: new (
      vfs: VfsLike,
      options: { port: number; root: string },
    ) => ViteDevServerInstance;
  }>;
  const { ViteDevServer } = await nativeImport(ALMOSTNODE_RUNTIME_URL);

  class SmartViteDevServer extends (ViteDevServer as new (
    vfs: VfsLike,
    options: { port: number; root: string },
  ) => ViteDevServerInstance) {
    reportTransformError(response: DevServerResponse): void {
      const message = extractTransformErrorFromResponse(response);
      if (message) {
        reportPreviewError(message);
      }
    }

    async transformAndServe(filePath: string, urlPath: string): Promise<DevServerResponse> {
      try {
        const content = this.vfs.readFileSync(filePath, 'utf8');
        await this.transformCode(content, urlPath);
      } catch (error) {
        const message = formatEsbuildTransformError(
          error as Parameters<typeof formatEsbuildTransformError>[0],
        );
        reportPreviewError(message);
        return createTransformErrorResponse(message) as DevServerResponse;
      }

      return super.handleRequest('GET', urlPath, {}, null);
    }

    async handleRequest(
      method: string,
      url: string,
      headers: Record<string, string>,
      body: unknown,
    ): Promise<DevServerResponse> {
      const urlObj = new URL(url, 'http://localhost');
      const pathname = urlObj.pathname;
      const filePath = this.resolvePath(pathname);

      if (pathname === '/dist' || pathname.startsWith('/dist/')) {
        if (this.exists(filePath) && !this.isDirectory(filePath)) {
          return this.serveFile(filePath);
        }
        if (this.isDirectory(filePath) && this.exists(`${filePath}/index.html`)) {
          return this.serveFile(`${filePath}/index.html`);
        }
        return this.notFound(pathname);
      }

      if (pathname.endsWith('.module.css')) {
        const secFetchDest =
          headers['sec-fetch-dest'] || headers['Sec-Fetch-Dest'] || headers['SEC-FETCH-DEST'] || '';

        const isModuleImport =
          secFetchDest === 'script' || secFetchDest === 'empty' || secFetchDest === '';

        if (isModuleImport && this.exists(filePath)) {
          return this.serveCssModule(filePath);
        }
      }

      if (!this.exists(filePath)) {
        for (const ext of ['.jsx', '.tsx', '.js', '.ts']) {
          if (this.exists(filePath + ext)) {
            const response = await super.handleRequest(
              method,
              url.replace(pathname, pathname + ext),
              headers,
              body,
            );
            this.reportTransformError(response);
            return response;
          }
        }
      }

      const response = await super.handleRequest(method, url, headers, body);
      this.reportTransformError(response);
      return response;
    }

    serveCssModule(filePath: string): DevServerResponse {
      try {
        const css = this.vfs.readFileSync(filePath, 'utf8');
        const { js } = buildCssModuleJavaScript(filePath, css);
        const buffer = new TextEncoder().encode(js);
        return {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'no-cache',
            'X-CSS-Module': 'true',
          },
          body: buffer,
        };
      } catch (err) {
        console.error('[SmartViteDevServer] CSS Module error:', err);
        return this.serverError(err);
      }
    }
  }

  if (container.serverBridge) {
    const swUrl = '/__sw__.js';
    try {
      await container.serverBridge.initServiceWorker({ swUrl });
    } catch (err) {
      console.error('[DevServer] Service Worker registration FAILED:', err);
      throw err;
    }
    const devServer = new SmartViteDevServer(container.vfs, { port: 3000, root: '/' });
    container.devServer = devServer;
    container.serverBridge.registerServer(devServer, 3000);
    onLog('Service Worker registered. Smart virtual server started on port 3000.');
  } else {
    console.warn('[DevServer] container.serverBridge is missing!');
  }
}
