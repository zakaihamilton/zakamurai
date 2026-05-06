/**
 * Compiler utility that uses almostnode to run build scripts in the browser.
 */

// Module-level singleton — persists across Compiler instances so the container
// (and its VFS) can be reused between compilations and cleared on demand.
let _sharedContainer = null;

export class Compiler {
  constructor(onLog) {
    this.onLog = onLog;
  }

  /** Returns the current shared container, or null if not yet initialised. */
  static getContainer() {
    return _sharedContainer;
  }

  /**
   * Destroys the shared container and wipes the module-level reference.
   * The next compile() call will re-create a fresh container.
   */
  static async reset() {
    if (_sharedContainer) {
      try {
        if (typeof _sharedContainer.teardown === 'function') {
          _sharedContainer.teardown();
        } else if (typeof _sharedContainer.destroy === 'function') {
          _sharedContainer.destroy();
        } else {
          _sharedContainer.vfs?.reset?.();
        }
      } catch (_) {
        /* ignore */
      }
      _sharedContainer = null;
    }

    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          // Only unregister our specific almostnode worker
          if (registration.active?.scriptURL.includes('__sw__.js')) {
            await registration.unregister();
            console.log('Service Worker unregistered.');
          }
        }
      } catch (err) {
        console.warn('Failed to unregister Service Worker:', err);
      }
    }

    console.log('Compiler state and Service Worker completely cleared.');
  }

  get container() {
    return _sharedContainer;
  }

  async init() {
    if (!_sharedContainer) {
      this.onLog('Starting almostnode container...');
      try {
        // Load almostnode directly from the public directory to bypass Turbopack/Webpack
        // this avoids build-time analysis issues and __turbopack_context__ errors
        const nativeImport = new Function('specifier', 'return import(specifier)');
        const { createContainer, ViteDevServer } = await nativeImport('/lib/almostnode/index.mjs');

        // Helper for CSS module hashing
        const simpleHash = (str) => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          return Math.abs(hash).toString(36).substring(0, 6);
        };

        // Create a subclass that handles missing extensions (like Vite does)
        class SmartViteDevServer extends ViteDevServer {
          async handleRequest(method, url, headers, body) {
            const urlObj = new URL(url, 'http://localhost');
            const pathname = urlObj.pathname;
            const filePath = this.resolvePath(pathname);

            // Handle CSS Modules (*.module.css)
            if (pathname.endsWith('.module.css')) {
              const secFetchDest =
                headers['sec-fetch-dest'] ||
                headers['Sec-Fetch-Dest'] ||
                headers['SEC-FETCH-DEST'] ||
                '';

              // In browser context, serve CSS as module when requested as script/empty (fetch)
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

          /**
           * Serve a CSS Module file as a JavaScript module.
           * Scopes class names and injects CSS into the DOM.
           */
          serveCssModule(filePath) {
            try {
              const css = this.vfs.readFileSync(filePath, 'utf8');
              const fileHash = simpleHash(filePath + css);

              const globalMatches = [];
              const globalBlockMatches = [];

              // 1. Hide :global(...) selectors to prevent hashing classes inside them
              let processedCss = css.replace(/:global\s*\(([^)]+)\)/g, (_match, selector) => {
                const placeholder = `__CSS_GLOBAL_${globalMatches.length}__`;
                globalMatches.push(selector);
                return placeholder;
              });

              // 2. Hide :global { ... } blocks
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
                    processedCss.substring(0, blockMatch.index) +
                    placeholder +
                    processedCss.substring(i);
                  globalBlockRegex.lastIndex = 0; // Restart search after modification
                } else {
                  break; // Malformed CSS
                }
              }

              const classMap = {};
              // Simple regex to find class selectors (.className followed by valid CSS separator or end)
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
                // Replace .name with .hashed, ensuring we only match the full class name
                const replaceRegex = new RegExp(`\\.(${name})(?=[\\s,{.\\[:#]|$)`, 'g');
                scopedCss = scopedCss.replace(replaceRegex, `.${hashed}`);
              }

              // 3. Restore global content, stripping the :global wrapper
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

        _sharedContainer = await createContainer({
          onConsole: (level, ...args) => {
            this.onLog(`[${level.toUpperCase()}] ${args.join(' ')}`);
          },
        });

        // Initialize service worker for networking support
        if (_sharedContainer.serverBridge) {
          await _sharedContainer.serverBridge.initServiceWorker({ swUrl: '/__sw__.js' });

          // Register our smart virtual server on port 3000.
          const devServer = new SmartViteDevServer(_sharedContainer.vfs, { port: 3000, root: '/' });
          _sharedContainer.serverBridge.registerServer(devServer, 3000);

          this.onLog('Service Worker registered. Smart virtual server started on port 3000.');
        }
      } catch (err) {
        this.onLog(`Failed to start container: ${err.message}`);
        throw err;
      }
    }
    return _sharedContainer;
  }

  async syncFiles(fs, folderTree, fileContents) {
    const container = await this.init();
    this.onLog('Synchronizing files to virtual environment...');

    const syncFile = async (fullPath, contentPromise) => {
      // Ensure fullPath is a string to avoid startsWith errors
      const pathStr = String(fullPath);
      const vfsPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
      // Use in-memory content if available (for unsaved changes)
      const inMemory = fileContents[pathStr];
      let content;
      if (inMemory !== undefined) {
        content = inMemory;
      } else {
        try {
          content = await contentPromise();
        } catch (err) {
          this.onLog(`Warning: Failed to read ${pathStr}: ${err.message}`);
          content = '';
        }
      }
      container.vfs.writeFileSync(vfsPath, content);
    };

    if (fs.mode === 'local' && fs.rootHandle) {
      const traverse = async (handle, path = '') => {
        for await (const [name, entry] of handle.entries()) {
          const entryPath = path ? `${path}/${name}` : name;
          if (entry.kind === 'file') {
            await syncFile(entryPath, async () => {
              const file = await entry.getFile();
              return await file.text();
            });
          } else if (entry.kind === 'directory') {
            if (!container.vfs.existsSync(`/${entryPath}`)) {
              container.vfs.mkdirSync(`/${entryPath}`, { recursive: true });
            }
            await traverse(entry, entryPath);
          }
        }
      };
      await traverse(fs.rootHandle);
    } else {
      const syncNode = async (node, path = '') => {
        const fullPath = path ? `${path}/${node.name}` : node.name;
        if (node.isDir || node.type === 'folder') {
          if (!container.vfs.existsSync(`/${fullPath}`)) {
            container.vfs.mkdirSync(`/${fullPath}`, { recursive: true });
          }
          if (node.children) {
            for (const child of node.children) {
              await syncNode(child, fullPath);
            }
          }
        } else {
          await syncFile(fullPath, async () => {
            return node.content || '';
          });
        }
      };

      for (const node of folderTree) {
        await syncNode(node);
      }
    }
    this.onLog('File synchronization complete.');
  }

  async compile(fs, folderTree, fileContents) {
    try {
      const container = await this.init();
      const { npm, runtime, vfs } = container;

      await this.syncFiles(fs, folderTree, fileContents);

      if (vfs.existsSync('/package.json')) {
        this.onLog('package.json found. Installing dependencies...');

        const content = vfs.readFileSync('/package.json', 'utf8');
        if (!content || !content.trim()) {
          throw new Error('package.json is empty or invalid');
        }

        await npm.installFromPackageJson({
          includeDev: true,
          onProgress: (msg) => this.onLog(`[NPM] ${msg}`),
        });

        let packageJson;
        try {
          packageJson = JSON.parse(content);
        } catch (e) {
          throw new Error(`Failed to parse package.json: ${e.message}`);
        }

        if (packageJson.scripts?.build) {
          const buildCommand = packageJson.scripts.build;
          this.onLog(`Parsed build sequence: ${buildCommand}`);

          // Ensure type: module for Vite if not present
          if (buildCommand.includes('vite') && packageJson.type !== 'module') {
            this.onLog('Adding "type": "module" to package.json for Vite compatibility...');
            packageJson.type = 'module';
            vfs.writeFileSync('/package.json', JSON.stringify(packageJson, null, 2));
          }

          // Ensure a basic vite.config.js exists if using vite build and it's missing
          if (
            buildCommand.includes('vite') &&
            !vfs.existsSync('/vite.config.js') &&
            !vfs.existsSync('/vite.config.ts')
          ) {
            this.onLog('No vite.config.js found. Creating a default one...');
            const defaultConfig = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: {\n      '@': '/src',\n    },\n  },\n  build: {\n    outDir: 'dist',\n    emptyOutDir: true,\n  }\n});`;
            vfs.writeFileSync('/vite.config.js', defaultConfig);
          }

          // Ensure index.html exists for Vite builds
          if (buildCommand.includes('vite') && !vfs.existsSync('/index.html')) {
            this.onLog('No index.html found. Creating a default one for Vite...');

            // Smart entry-point detection
            let entryFile = '/src/main.jsx'; // Standard Vite React default
            if (vfs.existsSync('/src/index.jsx')) entryFile = '/src/index.jsx';
            else if (vfs.existsSync('/src/main.tsx')) entryFile = '/src/main.tsx';
            else if (vfs.existsSync('/src/index.tsx')) entryFile = '/src/index.tsx';
            else if (!vfs.existsSync('/src/main.jsx')) {
              // Re-added the generation logic to prevent blank screens!
              if (vfs.existsSync('/src/App.jsx') || vfs.existsSync('/src/App.tsx')) {
                const isTs = vfs.existsSync('/src/App.tsx');
                const ext = isTs ? 'tsx' : 'jsx';

                // Note the explicit extension './App.jsx' to satisfy strict browser ESM rules
                const mountCode = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.${ext}';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`;

                if (!vfs.existsSync('/src')) vfs.mkdirSync('/src');
                vfs.writeFileSync(`/src/main.${ext}`, mountCode);
                entryFile = `/src/main.${ext}`;
                this.onLog(`No mount point found. Auto-generated /src/main.${ext}`);
              }
            }

            const entryFileRel = entryFile.startsWith('/') ? entryFile.slice(1) : entryFile;

            const defaultHtml = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <base href="/__virtual__/3000/">\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${packageJson.name || 'Vite App'}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="${entryFileRel}"></script>\n  </body>\n</html>`;
            vfs.writeFileSync('/index.html', defaultHtml);
          }

          // Split chained commands (e.g., "tsc && vite build") so we can process them sequentially
          const subCommands = buildCommand.split('&&').map((c) => c.trim());

          for (const cmdString of subCommands) {
            this.onLog(`-> Executing: ${cmdString}`);
            const parts = cmdString.split(/\s+/);
            const cmd = parts[0];
            const args = parts.slice(1);

            const knownBinaries = {
              tsc: '/node_modules/typescript/bin/tsc',
              // Rollup 4 and esbuild also contain native binaries, so we treat them carefully
              rollup: '/node_modules/rollup/dist/bin/rollup',
              esbuild: '/node_modules/esbuild/bin/esbuild',
            };

            if (cmd === 'vite' || cmd === 'esbuild') {
              // --- ARCHITECTURAL SANDBOX BYPASS ---
              this.onLog(
                '[WARN] Native binaries (Go/Rust) cannot be executed in a pure JS browser sandbox.',
              );
              this.onLog(
                `Compiler: Bypassing native bundler. Handing off to almostnode's native ESM Transformer...`,
              );

              const isBuild = args.includes('build');

              if (isBuild) {
                // To simulate a successful "build" for the UI, we just copy the entry point to /dist.
                // The almostnode Service Worker will intercept the iframe requests and compile the JSX on the fly.
                if (!vfs.existsSync('/dist')) vfs.mkdirSync('/dist');

                if (vfs.existsSync('/index.html')) {
                  vfs.writeFileSync('/dist/index.html', vfs.readFileSync('/index.html', 'utf8'));
                }

                this.onLog(
                  'Mock build complete. Application ready for Service Worker preview interception.',
                );
              } else {
                this.onLog(
                  'Dev server requested. The almostnode Service Worker is already listening for preview requests.',
                );
              }
            } else if (knownBinaries[cmd] && vfs.existsSync(knownBinaries[cmd])) {
              // --- GENERAL PURE-JS CLI RUNTIME BYPASS ---
              this.onLog(`Compiler: Routing pure-JS CLI '${cmd}' directly to Node runtime...`);
              const scriptPath = knownBinaries[cmd];
              const argsString = args.map((a) => `'${a}'`).join(', ');

              const proxyCode = `
process.argv = ['node', '${scriptPath}', ${argsString}];
process.env.NODE_ENV = 'production';
import('${scriptPath}').catch(err => console.error('[Runner Error]', err));
`;
              vfs.writeFileSync('/.almostnode-runner.js', proxyCode);
              await runtime.runFileAsync('/.almostnode-runner.js');
            } else {
              // --- FALLBACK SHELL EXECUTION ---
              const result = await container.run(cmdString, {
                env: {
                  NODE_ENV: 'production',
                  PWD: '/',
                  PATH: '/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
                },
                onStdout: (data) => {
                  if (data) {
                    const msg = data.toString().trim();
                    if (msg) this.onLog(msg);
                  }
                },
                onStderr: (data) => {
                  if (data) {
                    const msg = data.toString().trim();
                    if (msg) this.onLog(`ERR: ${msg}`);
                  }
                },
              });

              if (result.exitCode !== 0) {
                this.onLog(`Command failed with exit code ${result.exitCode}`);
              }
            }
          }

          // Delay slightly to allow async tasks to wrap up
          setTimeout(() => {
            this.onLog('Build sequence completed.');
            if (vfs.existsSync('/dist')) {
              const files = vfs.readdirSync('/dist');
              this.onLog(`Generated files in /dist: ${files.join(', ')}`);
            }
          }, 500);
        } else {
          this.onLog('No build script found in package.json.');
          // Try running main file if build script is missing
          const mainFile = packageJson.main || 'index.js';
          if (vfs.existsSync(`/${mainFile}`)) {
            this.onLog(`Running main file: ${mainFile}`);
            await runtime.runFileAsync(`/${mainFile}`);
          }
        }
      } else {
        this.onLog('No package.json found. Trying to run index.js...');
        if (vfs.existsSync('/index.js')) {
          await runtime.runFileAsync('/index.js');
        } else {
          this.onLog('Error: No entry point found (package.json or index.js).');
        }
      }
    } catch (err) {
      this.onLog(`Compilation error: ${err.message}`);
      if (err.stack) {
        this.onLog(`Stack: ${err.stack}`);
      }
      console.error(err);
    }
  }
}
