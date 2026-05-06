/**
 * Compiler utility that uses almostnode to run build scripts in the browser.
 */
export class Compiler {
  constructor(onLog) {
    this.onLog = onLog;
    this.container = null;
  }

  async init() {
    if (!this.container) {
      this.onLog('Starting almostnode container...');
      try {
        // Load almostnode directly from the public directory to bypass Turbopack/Webpack
        // this avoids build-time analysis issues and __turbopack_context__ errors
        // biome-ignore lint/security/noGlobalEval: deliberate workaround for dynamic import
        const { createContainer } = await eval('import("/lib/almostnode/index.mjs")');
        this.container = await createContainer({
          onConsole: (level, ...args) => {
            this.onLog(`[${level.toUpperCase()}] ${args.join(' ')}`);
          },
        });

        // Initialize service worker for networking support
        if (this.container.serverBridge) {
          await this.container.serverBridge.initServiceWorker({ swUrl: '/__sw__.js' });
        }
      } catch (err) {
        this.onLog(`Failed to start container: ${err.message}`);
        throw err;
      }
    }
    return this.container;
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
          this.onLog(`Running build script: ${packageJson.scripts.build}`);

          // Diagnostic: check current directory
          try {
            const cwd = vfs.cwd ? vfs.cwd() : '/';
            this.onLog(`Virtual working directory: ${cwd}`);
          } catch (e) {
            this.onLog(`Could not determine VFS cwd: ${e.message}`);
          }

          // Ensure type: module for Vite if not present
          if (packageJson.scripts.build.includes('vite') && packageJson.type !== 'module') {
            this.onLog('Adding "type": "module" to package.json for Vite compatibility...');
            packageJson.type = 'module';
            vfs.writeFileSync('/package.json', JSON.stringify(packageJson, null, 2));
          }

          // Ensure a basic vite.config.js exists if using vite build and it's missing
          if (
            packageJson.scripts.build.includes('vite') &&
            !vfs.existsSync('/vite.config.js') &&
            !vfs.existsSync('/vite.config.ts')
          ) {
            this.onLog('No vite.config.js found. Creating a default one...');
            const defaultConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
`;
            vfs.writeFileSync('/vite.config.js', defaultConfig);
          }

          // Ensure index.html exists for Vite builds
          if (packageJson.scripts.build.includes('vite') && !vfs.existsSync('/index.html')) {
            this.onLog('No index.html found. Creating a default one for Vite...');
            const defaultHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${packageJson.name || 'Vite App'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/App.jsx"></script>
  </body>
</html>
`;
            vfs.writeFileSync('/index.html', defaultHtml);
          }

          const buildCommand = packageJson.scripts.build;
          this.onLog(`Executing build command: ${buildCommand}`);

          const result = await container.run(buildCommand, {
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
            this.onLog(`Build failed with exit code ${result.exitCode}`);
            if (result.error) {
              this.onLog(`Build error: ${result.error.message || result.error}`);
            }
            // Capture any remaining output
            if (result.stdout && result.stdout.length > 0) {
              this.onLog(`Last stdout: ${result.stdout.toString().slice(-500)}`);
            }
            if (result.stderr && result.stderr.length > 0) {
              this.onLog(`Last stderr: ${result.stderr.toString().slice(-500)}`);
            }
          } else {
            this.onLog('Build completed successfully.');
            // Check for dist folder
            if (vfs.existsSync('/dist')) {
              const files = vfs.readdirSync('/dist');
              this.onLog(`Generated files in /dist: ${files.join(', ')}`);
            }
          }
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
