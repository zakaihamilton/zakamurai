/**
 * Compiler utility that uses almostnode to run build scripts in the browser.
 */

import { getSharedContainer, initContainer, resetContainer } from './container';
import { setupSmartDevServer } from './dev-server';
import { scaffoldMissingFiles } from './scaffold';
import { syncFilesToContainer } from './syncer';

export class Compiler {
  constructor(onLog) {
    this.onLog = onLog;
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
    return await initContainer(this.onLog, (container) =>
      setupSmartDevServer(container, this.onLog),
    );
  }

  async syncFiles(fs, folderTree, fileContents) {
    const container = await this.init();
    await syncFilesToContainer(container, fs, folderTree, fileContents, this.onLog);
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

          scaffoldMissingFiles(vfs, packageJson, this.onLog);

          // Split chained commands (e.g., "tsc && vite build") so we can process them sequentially
          const subCommands = buildCommand.split('&&').map((c) => c.trim());

          for (const cmdString of subCommands) {
            this.onLog(`-> Executing: ${cmdString}`);
            const parts = cmdString.split(/\s+/);
            const cmd = parts[0];
            const args = parts.slice(1);

            const knownBinaries = {
              tsc: '/node_modules/typescript/bin/tsc',
              rollup: '/node_modules/rollup/dist/bin/rollup',
              esbuild: '/node_modules/esbuild/bin/esbuild',
            };

            if (cmd === 'vite' || cmd === 'esbuild') {
              this.onLog(
                '[WARN] Native binaries (Go/Rust) cannot be executed in a pure JS browser sandbox.',
              );
              this.onLog(
                `Compiler: Bypassing native bundler. Handing off to almostnode's native ESM Transformer...`,
              );

              const isBuild = args.includes('build');

              if (isBuild) {
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

          setTimeout(() => {
            this.onLog('Build sequence completed.');
            if (vfs.existsSync('/dist')) {
              const files = vfs.readdirSync('/dist');
              this.onLog(`Generated files in /dist: ${files.join(', ')}`);
            }
          }, 500);
        } else {
          this.onLog('No build script found in package.json.');
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
      throw err;
    }
  }
}
