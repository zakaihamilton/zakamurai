/**
 * Custom Vite Dev Server with CSS Module support.
 */

const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
};

export async function setupSmartDevServer(container, onLog) {
  const nativeImport = new Function('specifier', 'return import(specifier)');
  const { ViteDevServer } = await nativeImport('/lib/almostnode/index.mjs');

  class SmartViteDevServer extends ViteDevServer {
    async handleRequest(method, url, headers, body) {
      const urlObj = new URL(url, 'http://localhost');
      const pathname = urlObj.pathname;
      const filePath = this.resolvePath(pathname);

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
            return super.handleRequest(
              method,
              url.replace(pathname, pathname + ext),
              headers,
              body,
            );
          }
        }
      }
      return super.handleRequest(method, url, headers, body);
    }

    serveCssModule(filePath) {
      try {
        const css = this.vfs.readFileSync(filePath, 'utf8');
        const fileHash = simpleHash(filePath + css);

        const globalMatches = [];
        const globalBlockMatches = [];

        let processedCss = css.replace(/:global\s*\(([^)]+)\)/g, (_match, selector) => {
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
            const blockContent = processedCss.substring(
              blockMatch.index + blockMatch[0].length,
              i - 1,
            );
            const placeholder = `__CSS_GLOBAL_BLOCK_${globalBlockMatches.length}__`;
            globalBlockMatches.push(blockContent);
            processedCss =
              processedCss.substring(0, blockMatch.index) + placeholder + processedCss.substring(i);
            globalBlockRegex.lastIndex = 0;
          } else {
            break;
          }
        }

        const classMap = {};
        const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s,{.[:#]|$)/g;

        let match;
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
    await container.serverBridge.initServiceWorker({ swUrl });
    const devServer = new SmartViteDevServer(container.vfs, { port: 3000, root: '/' });
    container.serverBridge.registerServer(devServer, 3000);
    onLog('Service Worker registered. Smart virtual server started on port 3000.');
  }
}
