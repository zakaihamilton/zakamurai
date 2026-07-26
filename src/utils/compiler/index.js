/**
 * Compiler utility that uses almostnode to run build scripts in the browser.
 * Heavy deps (browser-bundler / esbuild-wasm, almostnode) load only when compile runs.
 */

import { getSharedContainer, initContainer, resetContainer } from './container';
import { setupSmartDevServer } from './dev-server';
import { scaffoldMissingFiles } from './scaffold';
import { syncFilesToContainer } from './syncer';

const loadBrowserBundler = () => import('./browser-bundler');

export class Compiler {
  constructor(onLog, onPhase = () => {}) {
    this.onLog = onLog;
    this.onPhase = onPhase;
  }

  /** Returns the current shared container, or null if not yet initialised. */
  static getContainer() {
    return getSharedContainer();
  }

  /**
   * Destroys the shared container and wipes the module-level reference.
   * The next compile() call will re-create a fresh container.
   */
  static async reset() {
    await resetContainer();
  }

  get container() {
    return getSharedContainer();
  }

  async init() {
    this.onPhase('initializing');
    const initPromise = initContainer(this.onLog, (container) =>
      setupSmartDevServer(container, this.onLog),
    );

    return await withTimeout(initPromise, 30000, 'Container initialization timed out after 30s');
  }

  async syncFiles(fs, folderTree, fileContents) {
    this.onPhase('syncing');
    const container = await this.init();
    await syncFilesToContainer(container, fs, folderTree, fileContents, this.onLog);
  }

  async compile(fs, folderTree, fileContents) {
    try {
      const container = await this.init();
      const { npm, runtime, vfs } = container;

      await this.syncFiles(fs, folderTree, fileContents);

      if (vfs.existsSync('/package.json')) {
        this.onPhase('installing');
        this.onLog('package.json found. Installing dependencies...');

        const content = vfs.readFileSync('/package.json', 'utf8');
        if (!content || !content.trim()) {
          throw new Error('package.json is empty or invalid');
        }

        const installPromise = npm.installFromPackageJson({
          includeDev: true,
          onProgress: (msg) => this.onLog(`[NPM] ${msg}`),
        });

        await withTimeout(installPromise, 60000, 'NPM install timed out after 60s');

        let packageJson;
        try {
          packageJson = JSON.parse(content);
        } catch (e) {
          throw new Error(`Failed to parse package.json: ${e.message}`);
        }

        if (packageJson.scripts?.build) {
          this.onPhase('bundling');
          const buildCommand = packageJson.scripts.build;
          this.onLog(`Parsed build sequence: ${buildCommand}`);

          scaffoldMissingFiles(vfs, packageJson, this.onLog);

          // Only support shell-free commands joined with &&. This preserves
          // quoted arguments while preventing browser builds from silently
          // interpreting pipes, redirects, or arbitrary shell constructs.
          const { bundleBrowserProject, isBrowserBundleCommand, parseBuildCommand } =
            await loadBrowserBundler();
          const subCommands = parseBuildCommand(buildCommand);

          for (const parts of subCommands) {
            this.onPhase('executing');
            const cmdString = parts.join(' ');
            this.onLog(`-> Executing: ${cmdString}`);
            const cmd = parts[0];
            const args = parts.slice(1);

            const knownBinaries = {
              tsc: '/node_modules/typescript/bin/tsc',
              rollup: '/node_modules/rollup/dist/bin/rollup',
              esbuild: '/node_modules/esbuild/bin/esbuild',
            };

            if (isBrowserBundleCommand(cmd, args)) {
              await bundleBrowserProject(vfs, packageJson, cmdString, this.onLog);
            } else if (knownBinaries[cmd] && vfs.existsSync(knownBinaries[cmd])) {
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
              const runPromise = container.run(cmdString, {
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

              // Add a 30-second timeout to each subcommand
              const result = await withTimeout(
                runPromise,
                30000,
                `Command '${cmdString}' timed out after 30s`,
              );

              if (result.exitCode !== 0) {
                const errorMsg = `Command '${cmdString}' failed with exit code ${result.exitCode}`;
                this.onLog(errorMsg);
                throw new Error(errorMsg); // Stop execution on failure
              }
            }
          }

          this.onLog('Build sequence completed.');
          if (vfs.existsSync('/dist')) {
            const files = vfs.readdirSync('/dist');
            this.onLog(`Generated files in /dist: ${files.join(', ')}`);
          }
        } else {
          this.onLog('No build script found in package.json.');
          const mainFile = packageJson.main || 'index.js';
          if (vfs.existsSync(`/${mainFile}`)) {
            this.onLog(`Running main file: ${mainFile}`);
            // Don't await indefinitely if it's a main entry point that might not exit
            const runPromise = runtime.runFileAsync(`/${mainFile}`);
            const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000));
            await Promise.race([runPromise, timeoutPromise]);
          }
        }
      } else {
        this.onPhase('executing');
        this.onLog('No package.json found. Trying to run index.js...');
        if (vfs.existsSync('/index.js')) {
          await runtime.runFileAsync('/index.js');
        } else {
          this.onLog('Error: No entry point found (package.json or index.js).');
        }
      }
    } catch (err) {
      this.onPhase(/timed out/i.test(err?.message || '') ? 'timeout' : 'error');
      this.onLog(`Compilation error: ${err.message}`);
      if (err.stack) {
        this.onLog(`Stack: ${err.stack}`);
      }
      console.error(err);
      throw err;
    }
  }
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
