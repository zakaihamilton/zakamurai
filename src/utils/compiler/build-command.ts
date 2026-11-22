import type { VfsLike } from './types';

const BROWSER_IGNORED_VITE_CONFIGS = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'vite.config.ts',
  'vite.config.mts',
] as const;

export function assertBrowserBuildSupported(vfs: VfsLike, buildCommand: string): void {
  // Presence of vite.config.* is common in Vite scaffolds. The browser bundler never executes
  // those files; it always uses supported defaults, so treat them as ignorable rather than fatal.
  void vfs;
  if (/(?:^|\s)--(?:config|plugin|outDir|base|ssr|watch)(?:\s|=|$)/.test(buildCommand)) {
    throw new Error('Browser builds do not support custom Vite/esbuild config files or plugins.');
  }
}

export function ignoredBrowserViteConfig(vfs: VfsLike): string | null {
  return BROWSER_IGNORED_VITE_CONFIGS.find((name) => vfs.existsSync(`/${name}`)) || null;
}

export function isBrowserBundleCommand(cmd: string, args: string[] = []): boolean {
  const runners = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx']);
  const supportedBuildTools = new Set(['vite', 'react-scripts']);
  let binary = cmd;
  let binaryArgs = args;

  if (runners.has(cmd)) {
    let index = 0;
    if ((cmd === 'npm' || cmd === 'pnpm') && args[0] === 'exec') {
      index = 1;
    }
    while (index < args.length && args[index].startsWith('-')) {
      index += 1;
    }
    binary = args[index];
    binaryArgs = args.slice(index + 1);
  }

  if (!binary) return false;
  const name = binary.split('/').pop();
  return (
    (supportedBuildTools.has(name || '') && binaryArgs.includes('build')) || name === 'esbuild'
  );
}

export function parseBuildCommand(command: string): string[][] {
  const commands: string[][] = [];
  let tokens: string[] = [];
  let token = '';
  let quote: string | null = null;
  const finishToken = () => {
    if (token) tokens.push(token);
    token = '';
  };
  const finishCommand = () => {
    finishToken();
    if (tokens.length) commands.push(tokens);
    tokens = [];
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && index + 1 < command.length)
        token += command[++index];
      else token += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) finishToken();
    else if (char === '&' && command[index + 1] === '&') {
      finishCommand();
      index += 1;
    } else if ('|;<>`'.includes(char) || char === '&') {
      throw new Error(
        `Unsupported shell operator '${char}' in build command. Use a standard Vite SPA build script.`,
      );
    } else token += char;
  }
  if (quote) throw new Error('Unterminated quote in build command.');
  finishCommand();
  return commands;
}
