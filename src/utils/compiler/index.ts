/**
 * Compiler utility that uses almostnode to run build scripts in the browser.
 * Heavy deps (browser-bundler / esbuild-wasm, almostnode) load only when compile runs.
 */

import { isBrowserBundleCommand, parseBuildCommand } from './browser-bundler';
import { reportDiagnostic } from '@/components/Diagnostics';
import { getSharedContainer, initContainer, resetContainer } from './container';
import { setupSmartDevServer } from './dev-server';
import { scaffoldMissingFiles } from './scaffold';
import { syncFilesToContainer } from './syncer';
import type { AlmostnodeContainer, FolderTreeNode, LocalFsLike, OnLog, OnPhase } from './types';

const loadBrowserBundler = () => import('./browser-bundler');

function usesBrowserBundler(buildCommand: string | undefined): boolean {
  if (!buildCommand) return false;
  try {
    const commands = parseBuildCommand(buildCommand);
    return (
      commands.length > 0 &&
      commands.every(([command, ...args]) => isBrowserBundleCommand(command, args))
    );
  } catch {
    // Preserve the existing command parser error later in compile(), where it is surfaced to the user.
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export class Compiler {
  onLog: OnLog;
  onPhase: OnPhase;

  constructor(onLog: OnLog, onPhase: OnPhase = () => {}) {
    this.onLog = onLog;
    this.onPhase = onPhase;
  }

  /** Returns the current shared container, or null if not yet initialised. */
  static getContainer(): AlmostnodeContainer | null {
    return getSharedContainer();
  }

  /**
   * Destroys the shared container and wipes the module-level reference.
   * The next compile() call will re-create a fresh container.
   */
  static async reset(): Promise<void> {
    await resetContainer();
  }

  get container(): AlmostnodeContainer | null {
    return getSharedContainer();
  }

  async init(): Promise<AlmostnodeContainer> {
    this.onPhase('initializing');
    const initPromise = initContainer(this.onLog, (container) =>
      setupSmartDevServer(container, this.onLog),
    );

    return await withTimeout(initPromise, 30000, 'Container initialization timed out after 30s');
  }

  async syncFiles(
    fs: LocalFsLike,
    folderTree: FolderTreeNode[],
    fileContents: Record<string, string>,
  ): Promise<void> {
    this.onPhase('syncing');
    const container = await this.init();
    await syncFilesToContainer(container, fs, folderTree, fileContents, this.onLog);
  }

  async compile(
    fs: LocalFsLike,
    folderTree: FolderTreeNode[],
    fileContents: Record<string, string>,
  ): Promise<void> {
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

        let packageJson: Record<string, unknown>;
        try {
          packageJson = JSON.parse(content) as Record<string, unknown>;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          throw new Error(`Failed to parse package.json: ${message}`);
        }

        const scripts = packageJson.scripts as Record<string, string> | undefined;
        const buildCommand = scripts?.build;
        const installPromise = npm.installFromPackageJson({
          // Vite/esbuild builds use our browser bundler, so installing lint/test tooling only
          // pulls unsupported development fixtures into the virtual runtime.
          includeDev: !usesBrowserBundler(buildCommand),
          onProgress: (msg: string) => this.onLog(`[NPM] ${msg}`),
        });

        await withTimeout(installPromise, 60000, 'NPM install timed out after 60s');

        if (scripts?.build) {
          this.onPhase('bundling');
          const buildCommand = scripts.build;
          this.onLog(`Parsed build sequence: ${buildCommand}`);

          scaffoldMissingFiles(vfs, packageJson, this.onLog);

          const { bundleBrowserProject, isBrowserBundleCommand, parseBuildCommand } =
            await loadBrowserBundler();
          const subCommands = parseBuildCommand(buildCommand);

          for (const parts of subCommands) {
            this.onPhase('executing');
            const cmdString = parts.join(' ');
            this.onLog(`-> Executing: ${cmdString}`);
            const cmd = parts[0];
            const args = parts.slice(1);

            const knownBinaries: Record<string, string> = {
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

              const result = await withTimeout(
                runPromise,
                30000,
                `Command '${cmdString}' timed out after 30s`,
              );

              if (result.exitCode !== 0) {
                const errorMsg = `Command '${cmdString}' failed with exit code ${result.exitCode}`;
                this.onLog(errorMsg);
                throw new Error(errorMsg);
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
          const mainFile = (packageJson.main as string | undefined) || 'index.js';
          if (vfs.existsSync(`/${mainFile}`)) {
            this.onLog(`Running main file: ${mainFile}`);
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
      const message = err instanceof Error ? err.message : String(err);
      this.onPhase(/timed out/i.test(message) ? 'timeout' : 'error');
      this.onLog(`Compilation error: ${message}`);
      reportDiagnostic({
        source: 'compiler',
        severity: 'error',
        message: 'Browser build failed',
        details: message,
      });
      if (err instanceof Error && err.stack) {
        this.onLog(`Stack: ${err.stack}`);
      }
      console.error(err);
      throw err;
    }
  }

  /** Execute a pre-validated package script in the browser container. */
  async runProjectCheck(
    fs: LocalFsLike,
    folderTree: FolderTreeNode[],
    fileContents: Record<string, string>,
    check: string,
  ): Promise<string> {
    const container = await this.init();
    await this.syncFiles(fs, folderTree, fileContents);
    const packageJson = JSON.parse(container.vfs.readFileSync('/package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const command = packageJson.scripts?.[check];
    if (!command) throw new Error(`Unknown package script: ${check}`);
    const output: string[] = [];
    for (const argv of parseBuildCommand(command)) {
      const commandText = argv.join(' ');
      const result = await withTimeout(
        container.run(commandText, {
          env: {
            NODE_ENV: 'test',
            PWD: '/',
            PATH: '/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
          },
          onStdout: (data) => data && output.push(data.toString().trim()),
          onStderr: (data) => data && output.push(`ERR: ${data.toString().trim()}`),
        }),
        30000,
        `Command '${commandText}' timed out after 30s`,
      );
      if (result.exitCode !== 0)
        throw new Error(
          `${output.filter(Boolean).join('\n')}\n${commandText} exited ${result.exitCode}`,
        );
    }
    return output.filter(Boolean).join('\n') || `${check} passed.`;
  }
}
