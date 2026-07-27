import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    initContainer: vi.fn(async (_onLog, callback) => {
      if (callback) callback(mockContainer);
      return mockContainer;
    }),
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
  parseBuildCommand: vi.fn((cmd) => [[cmd]]),
  bundleBrowserProject: vi.fn().mockResolvedValue(true),
  isBrowserBundleCommand: vi.fn((cmd) => cmd === 'vite'),
}));

import { Compiler } from './index';

describe('Compiler', () => {
  let onLog;
  let onPhase;
  let compiler;

  beforeEach(() => {
    onLog = vi.fn();
    onPhase = vi.fn();
    compiler = new Compiler(onLog, onPhase);
  });

  it('provides static container management', async () => {
    expect(Compiler.getContainer()).toBeDefined();
    await Compiler.reset();
  });

  it('initializes and syncs files', async () => {
    await compiler.syncFiles({}, [], {});
    expect(onPhase).toHaveBeenCalledWith('syncing');
  });

  it('compiles project with package.json build script (browser bundler command)', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json' || p === '/dist');
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { build: 'vite' } }));

    await compiler.compile({}, [], {});
    expect(onPhase).toHaveBeenCalledWith('bundling');
    expect(onLog).toHaveBeenCalledWith('Build sequence completed.');
  });

  it('compiles project with known binary script (tsc)', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation(
      (p) => p === '/package.json' || p === '/node_modules/typescript/bin/tsc',
    );
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { build: 'tsc' } }));

    await compiler.compile({}, [], {});
    expect(container.vfs.writeFileSync).toHaveBeenCalledWith(
      '/.almostnode-runner.js',
      expect.stringContaining('tsc'),
    );
  });

  it('compiles project using standard container.run for unknown binaries', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json');
    container.vfs.readFileSync.mockReturnValue(
      JSON.stringify({ scripts: { build: 'custom-tool' } }),
    );
    container.run.mockImplementation(async (_cmd, opts) => {
      opts.onStdout?.('stdout output');
      opts.onStderr?.('stderr output');
      return { exitCode: 0 };
    });

    await compiler.compile({}, [], {});
    expect(onLog).toHaveBeenCalledWith('stdout output');
    expect(onLog).toHaveBeenCalledWith('ERR: stderr output');
  });

  it('handles package.json with no build script by running main file', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json' || p === '/index.js');
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ main: 'index.js' }));

    await compiler.compile({}, [], {});
    expect(container.runtime.runFileAsync).toHaveBeenCalledWith('/index.js');
  });

  it('handles missing package.json by running index.js if present', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation((p) => p === '/index.js');

    await compiler.compile({}, [], {});
    expect(onLog).toHaveBeenCalledWith('No package.json found. Trying to run index.js...');
  });

  it('handles invalid package.json gracefully', async () => {
    const container = compiler.container;
    container.vfs.existsSync.mockImplementation((p) => p === '/package.json');
    container.vfs.readFileSync.mockReturnValue('');

    await expect(compiler.compile({}, [], {})).rejects.toThrow('package.json is empty or invalid');
    expect(onPhase).toHaveBeenCalledWith('error');
  });

  it('runs project check script successfully', async () => {
    const container = compiler.container;
    container.vfs.readFileSync.mockReturnValue(JSON.stringify({ scripts: { lint: 'eslint' } }));
    container.run.mockImplementation(async (_cmd, opts) => {
      opts.onStdout?.('all clean');
      return { exitCode: 0 };
    });

    const res = await compiler.runProjectCheck({}, [], {}, 'lint');
    expect(res).toBe('all clean');
  });
});
