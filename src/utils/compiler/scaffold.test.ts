import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createMutableVfsLike } from '@/test-utils/vfsMocks';
import type { MutableVfsLike } from '@/test-utils/vfsMocks';
import type { PackageJson } from './types';
import { scaffoldMissingFiles } from './scaffold';

describe('scaffoldMissingFiles', () => {
  let mockVfs: MutableVfsLike & { mkdirSync: Mock<(path: string) => void> };
  let onLogMock: Mock<(message: string) => void>;

  beforeEach(() => {
    const base = createMutableVfsLike();
    mockVfs = {
      ...base,
      writeFileSync: vi.fn((path: string, content: string | Uint8Array) => {
        base.writeFileSync(path, content);
      }),
      mkdirSync: vi.fn(),
    };
    onLogMock = vi.fn();
  });

  it('adds type: module to package.json if building with Vite and type is not module', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'vite build',
      },
    };
    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(packageJson.type).toBe('module');
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/package.json',
      expect.stringContaining('"type": "module"'),
    );
    expect(onLogMock).toHaveBeenCalledWith(expect.stringContaining('Adding "type": "module"'));
  });

  it('does not create a Node-only Vite config for browser builds', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).not.toHaveBeenCalledWith('/vite.config.js', expect.anything());
  });

  it('scaffolds index.html with detected entry point index.jsx', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/src/index.jsx', 'index jsx content');

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      expect.stringContaining('src="src/index.jsx"'),
    );
  });

  it('scaffolds index.html and auto-generates main.tsx if App.tsx exists', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/src/App.tsx', 'App component');

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/src/main.tsx',
      expect.stringContaining("import App from './App.tsx';"),
    );
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      expect.stringContaining('src="src/main.tsx"'),
    );
  });

  it('scaffolds index.html and auto-generates main.jsx if App.jsx exists and /src directory needs to be created', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/src/App.jsx', 'App component');

    mockVfs.existsSync = vi.fn((path: string) => {
      if (path === '/src') return false;
      return path === '/src/App.jsx';
    });

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.mkdirSync).toHaveBeenCalledWith('/src');
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/src/main.jsx',
      expect.stringContaining("import App from './App.jsx';"),
    );
  });
});
