import { describe, expect, it } from 'vitest';
import { __testables, assertBrowserBuildSupported } from './browser-bundler';

function vfs(files) {
  return {
    existsSync: (path) =>
      Object.hasOwn(files, path) || Object.keys(files).some((file) => file.startsWith(`${path}/`)),
    readFileSync: (path) => files[path],
  };
}

describe('browser-bundler', () => {
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
});
