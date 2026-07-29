import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AlmostnodeContainer } from './types';

vi.mock('./container', () => {
  const mockContainer = {
    vfs: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue([]),
    },
    npm: {
      installFromPackageJson: vi.fn().mockResolvedValue(true),
    },
    runtime: {
      runFileAsync: vi.fn().mockResolvedValue(true),
    },
    run: vi.fn().mockResolvedValue({ exitCode: 0 }),
  };
  return {
    getSharedContainer: vi.fn(() => mockContainer),
    initContainer: vi.fn(
      async (
        _onLog: (msg: string) => void,
        callback?: (container: typeof mockContainer) => void,
      ) => {
        if (callback) callback(mockContainer);
        return mockContainer;
      },
    ),
    resetContainer: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('./dev-server', () => ({
  setupSmartDevServer: vi.fn(),
}));

vi.mock('./syncer', () => ({
  syncFilesToContainer: vi.fn().mockResolvedValue(true),
}));

vi.mock('./scaffold', () => ({
  scaffoldMissingFiles: vi.fn(),
}));

vi.mock('./browser-bundler', () => ({
  parseBuildCommand: vi.fn((cmd: string) => [[cmd]]),
  bundleBrowserProject: vi.fn().mockResolvedValue(true),
  isBrowserBundleCommand: vi.fn((cmd: string) => cmd === 'vite'),
}));

import { Compiler } from './index';

type MockContainer = AlmostnodeContainer & {
  vfs: {
    existsSync: Mock<(path: string) => boolean>;
    readFileSync: Mock<(path: string) => string>;
    writeFileSync: Mock<(path: string, content: string) => void>;
    readdirSync: Mock<(path: string) => string[]>;
  };
  run: Mock<
    (
      cmd: string,
      opts: {
        onStdout?: (data: { toString: () => string }) => void;
        onStderr?: (data: { toString: () => string }) => void;
      },
    ) => Promise<{ exitCode: number }>
  >;
  runtime: { runFileAsync: Mock<(path: string) => Promise<unknown>> };
};

describe('Compiler', () => {
  let onLog: Mock<(message: string) => void>;
  let onPhase: Mock<(phase: string) => void>;
  let compiler: Compiler;

  beforeEach(() => {
    onLog = vi.fn();
    onPhase = vi.fn();
    compiler = new Compiler(onLog, onPhase);
  });

  const getContainer = (): MockContainer => compiler.container as MockContainer;

  it('provides static container management', async () => {
    expect(Compiler.getContainer()).toBeDefined();
    await Compiler.reset();
  });

  it('initializes and syncs files', async () => {
    await compiler.syncFiles({ mode: 'opfs' }, [], {});
    expect(onPhase).toHaveBeenCalledWith('syncing');
  });

  it('compiles project with package.json build script (browser bundler command)', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json' || p === '/dist');
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { build: 'vite' } }));

    await compiler.compile({ mode: 'opfs' }, [], {});
    expect(onPhase).toHaveBeenCalledWith('bundling');
    expect(onLog).toHaveBeenCalledWith('Build sequence completed.');
  });

  it('compiles project with known binary script (tsc)', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation(
      (p) => p === '/package.json' || p === '/node_modules/typescript/bin/tsc',
    );
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { build: 'tsc' } }));

    await compiler.compile({ mode: 'opfs' }, [], {});
    expect(container.vfs.writeFileSync).toHaveBeenCalledWith(
      '/.almostnode-runner.js',
      expect.stringContaining('tsc'),
    );
  });

  it('compiles project using standard container.run for unknown binaries', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json');
    container.vfs.readFileSync.mockReturnValue(
      JSON.stringify({ scripts: { build: 'custom-tool' } }),
    );
    container.run.mockImplementation(async (_cmd, opts) => {
      opts.onStdout?.({ toString: () => 'stdout output' });
      opts.onStderr?.({ toString: () => 'stderr output' });
      return { exitCode: 0 };
    });

    await compiler.compile({ mode: 'opfs' }, [], {});
    expect(onLog).toHaveBeenCalledWith('stdout output');
    expect(onLog).toHaveBeenCalledWith('ERR: stderr output');
  });

  it('handles package.json with no build script by running main file', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json' || p === '/index.js');
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ main: 'index.js' }));

    await compiler.compile({ mode: 'opfs' }, [], {});
    expect(container.runtime.runFileAsync).toHaveBeenCalledWith('/index.js');
  });

  it('handles missing package.json by running index.js if present', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation((p) => p === '/index.js');

    await compiler.compile({ mode: 'opfs' }, [], {});
    expect(onLog).toHaveBeenCalledWith('No package.json found. Trying to run index.js...');
  });

  it('handles invalid package.json gracefully', async () => {
    const container = getContainer();
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json');
    container.vfs.readFileSync.mockReturnValue('');

    await expect(compiler.compile({ mode: 'opfs' }, [], {})).rejects.toThrow(
      'package.json is empty or invalid',
    );
    expect(onPhase).toHaveBeenCalledWith('error');
  });

  it('runs project check script successfully', async () => {
    const container = getContainer();
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { lint: 'eslint' } }));
    container.run.mockImplementation(async (_cmd, opts) => {
      opts.onStdout?.({ toString: () => 'all clean' });
      return { exitCode: 0 };
    });

    const res = await compiler.runProjectCheck({ mode: 'opfs' }, [], {}, 'lint');
    expect(res).toBe('all clean');
  });
});
