import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __testables,
  assertBrowserBuildSupported,
  isBrowserBundleCommand,
} from './browser-bundler';

function vfs(files) {
  return {
    existsSync: (path) =>
      Object.hasOwn(files, path) || Object.keys(files).some((file) => file.startsWith(`${path}/`)),
    readFileSync: (path) => files[path],
  };
}

describe('browser-bundler', () => {
  afterEach(() => {
    __testables.resetInitialize();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('finds standard TypeScript/React SPA entry points', () => {
    expect(__testables.findEntryPoint(vfs({ '/src/main.tsx': '' }))).toBe('/src/main.tsx');
    expect(__testables.findEntryPoint(vfs({ '/src/index.jsx': '' }))).toBe('/src/index.jsx');
  });

  it('resolves project files, package roots, and package subpaths', () => {
    const fs = vfs({
      '/src/components/App.tsx': '',
      '/node_modules/react/package.json': JSON.stringify({ module: 'index.js' }),
      '/node_modules/react/index.js': '',
      '/node_modules/react/jsx-runtime.js': '',
    });
    expect(__testables.resolveSpecifier(fs, './components/App', '/src')).toBe(
      '/src/components/App.tsx',
    );
    expect(__testables.resolveSpecifier(fs, 'react', '/src')).toBe('/node_modules/react/index.js');
    expect(__testables.resolveSpecifier(fs, 'react/jsx-runtime', '/src')).toBe(
      '/node_modules/react/jsx-runtime.js',
    );
  });

  it('skips object-shaped browser maps when resolving package roots', () => {
    // Mirrors react-dom@18: client.js does require('react-dom') while package.json
    // has an object "browser" remapping map instead of a string entry.
    const fs = vfs({
      '/node_modules/react-dom/package.json': JSON.stringify({
        main: 'index.js',
        browser: {
          './server.js': './server.browser.js',
          './static.js': './static.browser.js',
        },
      }),
      '/node_modules/react-dom/index.js': '',
      '/node_modules/react-dom/client.js': "require('react-dom');",
    });
    expect(__testables.resolveSpecifier(fs, 'react-dom', '/node_modules/react-dom')).toBe(
      '/node_modules/react-dom/index.js',
    );
    expect(__testables.resolveSpecifier(fs, 'react-dom/client', '/src')).toBe(
      '/node_modules/react-dom/client.js',
    );
  });

  it('uses CSS module and static asset loaders', () => {
    expect(__testables.getLoader('/src/Button.module.css')).toBe('local-css');
    expect(__testables.getLoader('/public/logo.svg')).toBe('file');
    expect(__testables.getLoader('/src/data.json')).toBe('json');
  });

  it('rejects browser-incompatible Vite configuration and plugin flags', () => {
    expect(() => assertBrowserBuildSupported(vfs({ '/vite.config.ts': '' }), 'vite build')).toThrow(
      'vite.config.ts',
    );
    expect(() => assertBrowserBuildSupported(vfs({}), 'vite build --config custom.js')).toThrow(
      'do not support',
    );
  });

  it('keeps /dist prefixes in generated HTML asset URLs', () => {
    const html = __testables.createHtml(
      vfs({
        '/index.html':
          '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      }),
      { name: 'demo' },
      '/src/main.tsx',
      [
        { path: '/dist/assets/main-abc123.js', contents: new Uint8Array() },
        { path: '/dist/assets/main-abc123.css', contents: new Uint8Array() },
      ],
    );

    expect(html).toContain('src="/dist/assets/main-abc123.js"');
    expect(html).toContain('href="/dist/assets/main-abc123.css"');
    expect(html).not.toContain('src="/assets/main-abc123.js"');
    expect(html).not.toContain('/src/main.tsx');
  });

  it('detects bare and package-runner SPA build commands', () => {
    expect(isBrowserBundleCommand('vite', ['build'])).toBe(true);
    expect(isBrowserBundleCommand('npx', ['vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('npx', ['-y', 'vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('pnpm', ['exec', 'vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('yarn', ['vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('esbuild', [])).toBe(true);
    expect(isBrowserBundleCommand('./node_modules/.bin/vite', ['build'])).toBe(true);
    expect(isBrowserBundleCommand('vite', ['dev'])).toBe(false);
    expect(isBrowserBundleCommand('npx', ['tsc'])).toBe(false);
  });

  it('retries esbuild-wasm initialization after a failed attempt', async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error('wasm missing'))
      .mockResolvedValueOnce(undefined);

    vi.doMock('esbuild-wasm/lib/browser', () => ({
      initialize,
      build: vi.fn(),
    }));

    const { __testables: fresh } = await import('./browser-bundler');

    await expect(fresh.initialize()).rejects.toThrow('wasm missing');
    await expect(fresh.initialize()).resolves.toBeUndefined();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('bundles with the automatic JSX runtime', async () => {
    const build = vi.fn().mockResolvedValue({
      outputFiles: [{ path: '/dist/assets/main-abc.js', contents: new Uint8Array([1]) }],
    });
    const initialize = vi.fn().mockResolvedValue(undefined);

    vi.doMock('esbuild-wasm/lib/browser', () => ({
      initialize,
      build,
    }));

    const { bundleBrowserProject } = await import('./browser-bundler');
    const files = {
      '/src/main.jsx': 'import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root"));',
      '/index.html':
        '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    };
    const fs = {
      existsSync: (path) =>
        Object.hasOwn(files, path) || Object.keys(files).some((file) => file.startsWith(`${path}/`)),
      readFileSync: (path) => files[path],
      writeFileSync: (path, contents) => {
        files[path] = typeof contents === 'string' ? contents : contents;
      },
    };

    await bundleBrowserProject(fs, { name: 'demo' }, 'vite build');

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        jsx: 'automatic',
        entryPoints: ['/src/main.jsx'],
      }),
    );
  });
});
