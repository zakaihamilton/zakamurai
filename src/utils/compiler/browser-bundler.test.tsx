import { createMinimalVfsLike, createMutableVfsLike } from '@/test-utils/vfsMocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testables,
  assertBrowserBuildSupported,
  isBrowserBundleCommand,
} from './browser-bundler';
import type { VfsLike } from './types';

function vfs(files: Record<string, string> = {}): VfsLike {
  return createMutableVfsLike(files);
}

describe('browser-bundler', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      }),
    );
    vi.stubGlobal('WebAssembly', { compile: vi.fn().mockResolvedValue({}) });
  });

  afterEach(() => {
    __testables.resetInitialize();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('finds standard TypeScript/React SPA entry points', () => {
    expect(__testables.findEntryPoint(vfs({ '/src/main.tsx': '' }))).toBe('/src/main.tsx');
    expect(__testables.findEntryPoint(vfs({ '/src/index.jsx': '' }))).toBe('/src/index.jsx');
  });

  it('throws when no SPA entry point exists', () => {
    expect(() => __testables.findEntryPoint(vfs({}))).toThrow('No SPA entry point found');
  });

  it('maps file extensions to esbuild loaders including extensionless paths', () => {
    expect(__testables.getLoader('/src/app.ts')).toBe('ts');
    expect(__testables.getLoader('/src/app.tsx')).toBe('tsx');
    expect(__testables.getLoader('/src/app.jsx')).toBe('jsx');
    expect(__testables.getLoader('/src/app.css')).toBe('css');
    expect(__testables.getLoader('/public/logo.png')).toBe('file');
    expect(__testables.getLoader('/src/noextension')).toBe('js');
  });

  it('normalizes paths with parent traversal and resolves index files', () => {
    const fs = vfs({
      '/src/outside/foo.js': '',
    });
    expect(__testables.resolveSpecifier(fs, './../outside/foo', '/src/nested')).toBe(
      '/src/outside/foo.js',
    );
    const indexFs = createMinimalVfsLike({
      existsSync: (path: string) => path === '/src/components/index.tsx',
    });
    expect(__testables.resolveFile(indexFs, '/src/components')).toBe('/src/components/index.tsx');
  });

  it('resolves absolute imports against /public when not a source file', () => {
    const fs = vfs({ '/public/logo.png': '' });
    expect(__testables.resolveSpecifier(fs, '/logo.png', '/src')).toBe('/public/logo.png');
  });

  it('resolves package subpaths without package.json and throws when nothing resolves', () => {
    const subpathFs = createMinimalVfsLike({
      existsSync: (path: string) =>
        path === '/node_modules/legacy' || path === '/node_modules/legacy/utils.js',
      readFileSync: () => '',
    });
    expect(__testables.resolvePackage(subpathFs, 'legacy/utils')).toBe(
      '/node_modules/legacy/utils.js',
    );

    const emptyFs = createMinimalVfsLike({
      existsSync: (path: string) => path === '/node_modules/legacy',
      readFileSync: () => '',
    });
    expect(() => __testables.resolvePackage(emptyFs, 'legacy/missing')).toThrow(
      'no package.json or resolvable entry',
    );
  });

  it('falls through when package.json is unreadable during relative resolve', () => {
    const fs = vfs({
      '/node_modules/pkg/package.json': '{ invalid',
      '/node_modules/pkg/foo.js': '',
    });
    expect(__testables.resolveSpecifier(fs, './foo.js', '/node_modules/pkg')).toBe(
      '/node_modules/pkg/foo.js',
    );
  });

  it('covers selectExport and exportTarget edge cases', () => {
    expect(__testables.selectExport(['./first.js', './second.js'])).toBe('./first.js');
    expect(__testables.selectExport(null)).toBeNull();
    expect(__testables.selectExport({ browser: './browser.js', import: './esm.js' })).toBe(
      './browser.js',
    );
    expect(__testables.exportTarget('./only.js', '')).toBe('./only.js');
    expect(__testables.exportTarget(['./arr.js'], '')).toBe('./arr.js');
    expect(__testables.exportTarget({ import: './esm.js' }, '')).toBe('./esm.js');
    expect(__testables.exportTarget({ './*': './*.mjs' }, 'icons/check')).toBe('./icons/check.mjs');
    expect(__testables.exportTarget({ '.': './index.js' }, 'missing')).toBeNull();
  });

  it('rejects non-object package.json manifests', () => {
    expect(() =>
      __testables.resolvePackage(vfs({ '/node_modules/bad/package.json': 'null' }), 'bad'),
    ).toThrow('malformed');
  });

  it('builds HTML for JS-only output, missing head/body closers, and default template', () => {
    const jsOnly = __testables.createHtml(
      vfs({ '/index.html': '<html><head></head><body></body></html>' }),
      {},
      '/src/main.js',
      [{ path: '/dist/assets/main.js', contents: new Uint8Array() }],
    );
    expect(jsOnly).toContain('src="/dist/assets/main.js"');
    expect(jsOnly).not.toContain('stylesheet');

    const noClosers = __testables.createHtml(
      vfs({ '/index.html': '<html><div>bare document</div>' }),
      { name: 'demo' },
      '/src/main.js',
      [
        { path: '/dist/assets/main.js', contents: new Uint8Array() },
        { path: '/dist/assets/main.css', contents: new Uint8Array() },
      ],
    );
    expect(noClosers).toContain('rel="stylesheet"');
    expect(noClosers).toContain('<script');
    expect(noClosers).not.toContain('</head>');

    const defaultHtml = __testables.createHtml(vfs({}), { name: 'MyApp' }, '/src/main.js', []);
    expect(defaultHtml).toContain('<title>MyApp</title>');
    expect(defaultHtml).toContain('<div id="root"></div>');
  });

  it('removes trees and copies nested public assets', () => {
    const files: Record<string, string> = {
      '/dist/old/file.js': 'stale',
      '/public/nested/logo.svg': '<svg/>',
    };
    const removed: string[] = [];
    const fs: VfsLike = {
      existsSync: (path: string) =>
        Object.hasOwn(files, path) ||
        Object.keys(files).some((file) => file.startsWith(`${path}/`)),
      readFileSync: (path: string) => files[path],
      writeFileSync: (path: string, contents: string | Uint8Array) => {
        files[path] = typeof contents === 'string' ? contents : new TextDecoder().decode(contents);
      },
      readdirSync: (path: string) => {
        if (Object.hasOwn(files, path)) throw new Error('ENOTDIR');
        return Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map((file) => file.slice(path.length + 1).split('/')[0])
          .filter((name, index, names) => names.indexOf(name) === index);
      },
      unlinkSync: (path: string) => {
        removed.push(path);
        delete files[path];
      },
      rmdirSync: () => {},
    };
    __testables.removeTree(fs, '/dist');
    expect(removed).toContain('/dist/old/file.js');
    const copied = __testables.copyPublicFiles(fs);
    expect(copied).toContain('nested/logo.svg');
    expect(files['/dist/nested/logo.svg']).toBe('<svg/>');
  });

  it('detects npm exec and bunx runner variants', () => {
    expect(isBrowserBundleCommand('npm', ['exec', 'vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('bunx', ['vite', 'build'])).toBe(true);
    expect(isBrowserBundleCommand('npx', [])).toBe(false);
  });

  it('rejects additional unsupported shell operators in build commands', () => {
    expect(() => __testables.parseBuildCommand('vite build; rm -rf')).toThrow(
      'Unsupported shell operator',
    );
    expect(() => __testables.parseBuildCommand('vite build & sleep')).toThrow(
      'Unsupported shell operator',
    );
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
    expect(
      __testables.packageEntry(JSON.parse(fs.readFileSync('/node_modules/react-dom/package.json'))),
    ).toBe('index.js');
    expect(__testables.resolveSpecifier(fs, 'react-dom', '/node_modules/react-dom')).toBe(
      '/node_modules/react-dom/index.js',
    );
    expect(__testables.resolveSpecifier(fs, 'react-dom/client', '/src')).toBe(
      '/node_modules/react-dom/client.js',
    );
  });

  it('applies object browser remaps to the package entry when present', () => {
    expect(
      __testables.packageEntry({
        main: 'index.js',
        browser: { './index.js': './index.browser.js' },
      }),
    ).toBe('./index.browser.js');
    expect(
      __testables.packageEntry({
        main: './index.js',
        browser: { './index.js': './index.browser.js' },
      }),
    ).toBe('./index.browser.js');
  });

  it('applies browser remaps after exports resolution', () => {
    const fs = vfs({
      '/node_modules/pkg/package.json': JSON.stringify({
        exports: { '.': './index.js' },
        browser: { './index.js': './index.browser.js' },
      }),
      '/node_modules/pkg/index.js': '',
      '/node_modules/pkg/index.browser.js': '',
    });
    expect(__testables.resolvePackage(fs, 'pkg')).toBe('/node_modules/pkg/index.browser.js');
    expect(
      __testables.applyBrowserRemap(
        { browser: { './index.js': './index.browser.js' } },
        './index.js',
      ),
    ).toBe('./index.browser.js');
    // false remaps are skipped (not stubbed)
    expect(
      __testables.applyBrowserRemap({ browser: { './server.js': false } }, './server.js'),
    ).toBe('./server.js');
    expect(__testables.applyBrowserRemap(null, './x.js')).toBe('./x.js');
    expect(__testables.applyBrowserRemap({ browser: './entry.js' }, './x.js')).toBe('./x.js');
    expect(__testables.applyBrowserRemap({ browser: { './x.js': '' } }, './x.js')).toBe('./x.js');
  });

  it('applies browser remaps to relative imports inside a package', () => {
    const fs = vfs({
      '/node_modules/react-dom/package.json': JSON.stringify({
        main: 'index.js',
        browser: { './server.js': './server.browser.js' },
      }),
      '/node_modules/react-dom/server.js': '',
      '/node_modules/react-dom/server.browser.js': '',
    });
    expect(__testables.resolveSpecifier(fs, './server.js', '/node_modules/react-dom')).toBe(
      '/node_modules/react-dom/server.browser.js',
    );
  });

  it('prefers a string browser entry and falls back through module/main', () => {
    expect(__testables.packageEntry({ browser: './browser.js', main: 'index.js' })).toBe(
      './browser.js',
    );
    expect(__testables.packageEntry({ browser: '', module: './esm.js', main: 'index.js' })).toBe(
      './esm.js',
    );
    expect(__testables.packageEntry({ browser: { './other.js': './x.js' }, main: 'lib.js' })).toBe(
      'lib.js',
    );
    expect(__testables.packageEntry({})).toBe('index.js');
  });

  it('resolves a real-shaped react-dom tree including CJS self-require and scheduler', () => {
    // Mirrors almostnode-installed react-dom@18 / @19 package.json shape:
    // exports + object browser map + client.js requiring bare 'react-dom',
    // with index.js pulling cjs + scheduler.
    const reactDomPkg = {
      name: 'react-dom',
      main: 'index.js',
      exports: {
        '.': { 'react-server': './react-dom.react-server.js', default: './index.js' },
        './client': { 'react-server': './client.react-server.js', default: './client.js' },
        './server': {
          browser: './server.browser.js',
          default: './server.node.js',
        },
        './package.json': './package.json',
      },
      browser: {
        './server.js': './server.browser.js',
        './static.js': './static.browser.js',
      },
      dependencies: { scheduler: '^0.26.0' },
    };
    const fs = vfs({
      '/src/main.jsx':
        'import React from "react";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root"));',
      '/node_modules/react/package.json': JSON.stringify({
        main: 'index.js',
        exports: {
          '.': { default: './index.js' },
          './jsx-runtime': './jsx-runtime.js',
          './package.json': './package.json',
        },
      }),
      '/node_modules/react/index.js': 'module.exports = {};',
      '/node_modules/react/jsx-runtime.js': 'module.exports = {};',
      '/node_modules/react-dom/package.json': JSON.stringify(reactDomPkg),
      '/node_modules/react-dom/index.js':
        "module.exports = require('./cjs/react-dom.development.js');",
      '/node_modules/react-dom/client.js':
        "var m = require('react-dom');\nexports.createRoot = m.createRoot;",
      '/node_modules/react-dom/cjs/react-dom.development.js':
        "require('react');\nrequire('scheduler');\nexports.createRoot = function () {};",
      '/node_modules/react-dom/server.browser.js': '',
      '/node_modules/scheduler/package.json': JSON.stringify({
        main: 'index.js',
        exports: { '.': './index.js' },
      }),
      '/node_modules/scheduler/index.js': 'module.exports = {};',
    });

    // App import graph
    expect(__testables.resolveSpecifier(fs, 'react', '/src')).toBe('/node_modules/react/index.js');
    expect(__testables.resolveSpecifier(fs, 'react-dom/client', '/src')).toBe(
      '/node_modules/react-dom/client.js',
    );
    // The historical failure: bare 'react-dom' from inside client.js returned null
    // because object-shaped browser was coerced to "[object Object]".
    expect(__testables.resolveSpecifier(fs, 'react-dom', '/node_modules/react-dom')).toBe(
      '/node_modules/react-dom/index.js',
    );
    expect(
      __testables.resolveSpecifier(fs, './cjs/react-dom.development.js', '/node_modules/react-dom'),
    ).toBe('/node_modules/react-dom/cjs/react-dom.development.js');
    expect(__testables.resolveSpecifier(fs, 'scheduler', '/node_modules/react-dom/cjs')).toBe(
      '/node_modules/scheduler/index.js',
    );
    expect(__testables.resolveSpecifier(fs, 'react-dom/server', '/src')).toBe(
      '/node_modules/react-dom/server.browser.js',
    );
    // packageEntry must not treat the browser object as a path
    expect(__testables.packageEntry(reactDomPkg)).toBe('index.js');
  });

  it('resolves exports using browser, import, default, scoped packages, and patterns', () => {
    const fs = vfs({
      '/node_modules/@scope/ui/package.json': JSON.stringify({
        exports: {
          '.': { browser: './browser.js', import: './module.js', default: './main.js' },
          './icons/*': { import: './icons/*.mjs' },
        },
      }),
      '/node_modules/@scope/ui/browser.js': '',
      '/node_modules/@scope/ui/icons/check.mjs': '',
      '/node_modules/fallback/package.json': JSON.stringify({
        exports: { '.': { default: './default.js' } },
      }),
      '/node_modules/fallback/default.js': '',
      '/node_modules/conditional/package.json': JSON.stringify({
        exports: { import: './esm.js', default: './cjs.js' },
      }),
      '/node_modules/conditional/esm.js': '',
    });
    expect(__testables.resolveSpecifier(fs, '@scope/ui', '/src')).toBe(
      '/node_modules/@scope/ui/browser.js',
    );
    expect(__testables.resolveSpecifier(fs, '@scope/ui/icons/check', '/src')).toBe(
      '/node_modules/@scope/ui/icons/check.mjs',
    );
    expect(__testables.resolveSpecifier(fs, 'fallback', '/src')).toBe(
      '/node_modules/fallback/default.js',
    );
    expect(__testables.resolveSpecifier(fs, 'conditional', '/src')).toBe(
      '/node_modules/conditional/esm.js',
    );
  });

  it('reports missing, malformed, and non-exported packages clearly', () => {
    expect(() => __testables.resolvePackage(vfs({}), 'missing')).toThrow('not installed');
    expect(() =>
      __testables.resolvePackage(vfs({ '/node_modules/broken/package.json': '{' }), 'broken'),
    ).toThrow('malformed');
    expect(() =>
      __testables.resolvePackage(
        vfs({
          '/node_modules/private/package.json': JSON.stringify({ exports: { '.': './index.js' } }),
          '/node_modules/private/index.js': '',
          '/node_modules/private/hidden.js': '',
        }),
        'private/hidden',
      ),
    ).toThrow("does not provide './hidden'");
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

  it('preserves custom HTML and only replaces its source entry script', () => {
    const html = __testables.createHtml(
      vfs({
        '/index.html':
          '<html><head><meta name="theme-color" content="#111"></head><body><main>Custom</main><script type="module" src="src/main.tsx"></script><script src="/keep.js"></script></body></html>',
      }),
      {},
      '/src/main.tsx',
      [{ path: '/dist/assets/main.js', contents: new Uint8Array() }],
    );
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('<main>Custom</main>');
    expect(html).toContain('src="/keep.js"');
    expect(html).not.toContain('src="src/main.tsx"');
    expect(html).toContain('src="/dist/assets/main.js"');
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

  it('parses quoted build arguments and rejects unsupported shell operators', () => {
    expect(__testables.parseBuildCommand('tsc && npx vite build --mode "production"')).toEqual([
      ['tsc'],
      ['npx', 'vite', 'build', '--mode', 'production'],
    ]);
    expect(() => __testables.parseBuildCommand('vite build | tee output')).toThrow(
      'Unsupported shell operator',
    );
    expect(() => __testables.parseBuildCommand('vite build "')).toThrow('Unterminated quote');
  });

  it('retries esbuild-wasm initialization after a failed attempt', async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error('wasm missing'))
      .mockResolvedValueOnce(undefined);
    const wasmModule = {};
    const fetchCompilerAsset = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchCompilerAsset);
    vi.stubGlobal('WebAssembly', { compile: vi.fn().mockResolvedValue(wasmModule) });

    vi.doMock('esbuild-wasm/lib/browser', () => ({
      initialize,
      build: vi.fn(),
    }));

    const { __testables: fresh } = await import('./browser-bundler');

    await expect(fresh.initialize()).rejects.toThrow('wasm missing');
    await expect(fresh.initialize()).resolves.toBeUndefined();
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenLastCalledWith({ wasmModule, worker: true });
    expect(fetchCompilerAsset).toHaveBeenCalledWith('/esbuild/esbuild.wasm', {
      credentials: 'same-origin',
    });
  });

  it('reports a missing compiler asset with its response status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    vi.doMock('esbuild-wasm/lib/browser', () => ({ initialize: vi.fn(), build: vi.fn() }));

    const { __testables: fresh } = await import('./browser-bundler');

    await expect(fresh.initialize()).rejects.toThrow(
      'Unable to load the esbuild compiler asset (404)',
    );
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
    const files: Record<string, string> = {
      '/src/main.jsx':
        'import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root"));',
      '/index.html':
        '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    };
    const fs = createMutableVfsLike(files);

    await bundleBrowserProject(fs, { name: 'demo' }, 'vite build');

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        jsx: 'automatic',
        entryPoints: ['/src/main.jsx'],
      }),
    );
  });

  it('clears stale output and copies public assets into dist', async () => {
    const build = vi.fn().mockResolvedValue({
      outputFiles: [{ path: '/dist/assets/main-new.js', contents: new Uint8Array([1]) }],
    });
    vi.doMock('esbuild-wasm/lib/browser', () => ({ initialize: vi.fn(), build }));
    const { bundleBrowserProject } = await import('./browser-bundler');
    const files: Record<string, string> = {
      '/src/main.js': '',
      '/dist/stale.js': 'stale',
      '/public/logo.svg': '<svg/>',
    };
    const removed: string[] = [];
    const store = createMutableVfsLike(files);
    const fs: VfsLike = {
      ...store,
      unlinkSync: (path: string) => {
        removed.push(path);
        store.unlinkSync?.(path);
      },
      rmdirSync: (path: string) => {
        if (Object.hasOwn(files, path)) throw new Error('ENOTDIR');
      },
    };
    await bundleBrowserProject(fs, {}, 'vite build');
    expect(removed).toContain('/dist/stale.js');
    expect(files['/dist/logo.svg']).toBe('<svg/>');
    expect(files['/dist/index.html']).toContain('/dist/assets/main-new.js');
  });

  it('bundleBrowserProject succeeds for react-dom-like VFS (client requires react-dom)', async () => {
    // Historical failure: object-shaped browser + client.js require('react-dom')
    // made resolve return null / "[object Object]". Exercise the VFS plugin path.
    const reactDomPkg = {
      name: 'react-dom',
      main: 'index.js',
      exports: {
        '.': { default: './index.js' },
        './client': { default: './client.js' },
      },
      browser: {
        './server.js': './server.browser.js',
        './index.js': './index.js',
      },
    };
    const files: Record<string, string> = {
      '/src/main.jsx':
        'import { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root"));\n',
      '/index.html':
        '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      '/node_modules/react/package.json': JSON.stringify({
        main: 'index.js',
        exports: { '.': './index.js', './jsx-runtime': './jsx-runtime.js' },
      }),
      '/node_modules/react/index.js': 'export default {};',
      '/node_modules/react/jsx-runtime.js':
        'export const jsx = () => null; export const jsxs = jsx;',
      '/node_modules/react-dom/package.json': JSON.stringify(reactDomPkg),
      '/node_modules/react-dom/index.js':
        'export function createRoot() { return { render() {} }; }',
      '/node_modules/react-dom/client.js':
        "var m = require('react-dom');\nexports.createRoot = m.createRoot;",
      '/node_modules/react-dom/server.browser.js': '',
    };

    type ResolveCallback = (args: {
      path: string;
      importer?: string;
      resolveDir?: string;
    }) => { errors?: unknown; path?: string };

    const build = vi.fn().mockImplementation(
      async (options: {
        plugins: Array<{
          setup: (build: {
            onResolve: (opts: unknown, cb: ResolveCallback) => void;
            onLoad: () => void;
          }) => void;
        }>;
      }) => {
        const plugin = options.plugins[0];
        let onResolve: ResolveCallback | undefined;
        plugin.setup({
          onResolve: (_opts: unknown, cb: ResolveCallback) => {
            onResolve = cb;
          },
          onLoad: () => {},
        });

        const resolve = (path: string, importer?: string, resolveDir?: string) =>
          onResolve?.({ path, importer, resolveDir: resolveDir || '/src' });

        const entry = resolve('/src/main.jsx', undefined, '/');
        if (!entry) throw new Error('expected resolve result');
        expect(entry.errors).toBeUndefined();
        expect(entry.path).toBe('/src/main.jsx');

        const client = resolve('react-dom/client', '/src/main.jsx', '/src');
        if (!client) throw new Error('expected resolve result');
        expect(client.errors).toBeUndefined();
        expect(client.path).toBe('/node_modules/react-dom/client.js');

        // The path that previously failed inside client.js
        const root = resolve(
          'react-dom',
          '/node_modules/react-dom/client.js',
          '/node_modules/react-dom',
        );
        if (!root) throw new Error('expected resolve result');
        expect(root.errors).toBeUndefined();
        expect(root.path).toBe('/node_modules/react-dom/index.js');

        return {
          outputFiles: [{ path: '/dist/assets/main-abc.js', contents: new Uint8Array([1]) }],
        };
      },
    );

    vi.doMock('esbuild-wasm/lib/browser', () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      build,
    }));

    const { bundleBrowserProject } = await import('./browser-bundler');
    const fs = createMutableVfsLike(files);

    await expect(bundleBrowserProject(fs, { name: 'demo' }, 'vite build')).resolves.toMatchObject({
      entryPoint: '/src/main.jsx',
      files: expect.arrayContaining(['index.html']),
    });
    expect(build).toHaveBeenCalled();
    expect(files['/dist/index.html']).toContain('/dist/assets/main-abc.js');
  });
});
