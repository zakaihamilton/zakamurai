/**
 * Custom Vite Dev Server with CSS Module support.
 */

import { reportPreviewError } from '@/components/App/Views/PreviewArea/previewErrorBridge';
import {
  createTransformErrorResponse,
  extractTransformErrorFromResponse,
  formatEsbuildTransformError,
} from '@/components/App/Views/PreviewArea/previewErrorUtils';
import type { AlmostnodeContainer, OnLog, VfsLike } from './types';

type CssModuleResult = {
  js: string;
  classMap: Record<string, string>;
  scopedCss: string;
  fileHash: string;
};

type DevServerResponse = {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Uint8Array;
};

export const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
};

/**
 * Transforms a CSS Modules file into a JS module that injects scoped styles.
 * Exported for unit testing without almostnode.
 */
export function buildCssModuleJavaScript(filePath: string, css: string): CssModuleResult {
  const fileHash = simpleHash(filePath + css);

  const globalMatches: string[] = [];
  const globalBlockMatches: string[] = [];

  let processedCss = css.replace(/:global\s*\(([^)]+)\)/g, (_match, selector: string) => {
    const placeholder = `__CSS_GLOBAL_${globalMatches.length}__`;
    globalMatches.push(selector);
    return placeholder;
  });

  const globalBlockRegex = /:global\s*\{/g;
  while (true) {
    const blockMatch = globalBlockRegex.exec(processedCss);
    if (blockMatch === null) break;

    let braceCount = 1;
    let i = blockMatch.index + blockMatch[0].length;
    while (i < processedCss.length && braceCount > 0) {
      if (processedCss[i] === '{') braceCount++;
      else if (processedCss[i] === '}') braceCount--;
      i++;
    }
    if (braceCount === 0) {
      const blockContent = processedCss.substring(blockMatch.index + blockMatch[0].length, i - 1);
      const placeholder = `__CSS_GLOBAL_BLOCK_${globalBlockMatches.length}__`;
      globalBlockMatches.push(blockContent);
      processedCss =
        processedCss.substring(0, blockMatch.index) + placeholder + processedCss.substring(i);
      globalBlockRegex.lastIndex = 0;
    } else {
      break;
    }
  }

  const classMap: Record<string, string> = {};
  const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s,{.[:#]|$)/g;

  let match: RegExpExecArray | null;
  while (true) {
    match = classRegex.exec(processedCss);
    if (match === null) break;
    const className = match[1];
    if (!classMap[className]) {
      classMap[className] = `${className}_${fileHash}`;
    }
  }

  let scopedCss = processedCss;
  for (const [name, hashed] of Object.entries(classMap)) {
    const replaceRegex = new RegExp(`\\.(${name})(?=[\\s,{.\\[:#]|$)`, 'g');
    scopedCss = scopedCss.replace(replaceRegex, `.${hashed}`);
  }

  globalMatches.forEach((selector, i) => {
    scopedCss = scopedCss.replace(`__CSS_GLOBAL_${i}__`, selector);
  });
  globalBlockMatches.forEach((content, i) => {
    scopedCss = scopedCss.replace(`__CSS_GLOBAL_BLOCK_${i}__`, content);
  });

  const js = `
// CSS Module: ${filePath}
const classMap = ${JSON.stringify(classMap)};
const css = ${JSON.stringify(scopedCss)};

if (typeof document !== 'undefined') {
  const id = 'cssmod-' + ${JSON.stringify(fileHash)};
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-vite-dev-id', ${JSON.stringify(filePath)});
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export default classMap;
`;

  return { js, classMap, scopedCss, fileHash };
}

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
  const { ViteDevServer } = await nativeImport('/lib/almostnode/index.mjs');

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
