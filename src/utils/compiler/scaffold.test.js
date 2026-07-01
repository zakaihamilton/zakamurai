import { describe, expect, it, vi, beforeEach } from 'vitest';
import { scaffoldMissingFiles } from './scaffold';

describe('scaffoldMissingFiles', () => {
  let mockVfs;
  let onLogMock;

  beforeEach(() => {
    const files = new Map();
    mockVfs = {
      files,
      writeFileSync: vi.fn((path, content) => {
        files.set(path, content);
      }),
      existsSync: vi.fn((path) => {
        return files.has(path);
      }),
      mkdirSync: vi.fn(),
    };
    onLogMock = vi.fn();
  });

  it('adds type: module to package.json if building with Vite and type is not module', () => {
    const packageJson = {
      scripts: {
        build: 'vite build',
      },
    };
    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(packageJson.type).toBe('module');
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/package.json',
      expect.stringContaining('"type": "module"')
    );
    expect(onLogMock).toHaveBeenCalledWith(
      expect.stringContaining('Adding "type": "module"')
    );
  });

  it('scaffolds default vite.config.js if missing', () => {
    const packageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/vite.config.js',
      expect.stringContaining("plugins: [react()]")
    );
    expect(onLogMock).toHaveBeenCalledWith(
      expect.stringContaining('No vite.config.js found. Creating a default one...')
    );
  });

  it('scaffolds index.html with detected entry point index.jsx', () => {
    const packageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/vite.config.js', 'existing config');
    mockVfs.writeFileSync('/src/index.jsx', 'index jsx content');

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      expect.stringContaining('src="src/index.jsx"')
    );
  });

  it('scaffolds index.html and auto-generates main.tsx if App.tsx exists', () => {
    const packageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/vite.config.js', 'existing config');
    mockVfs.writeFileSync('/src/App.tsx', 'App component');

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/src/main.tsx',
      expect.stringContaining("import App from './App.tsx';")
    );
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/index.html',
      expect.stringContaining('src="src/main.tsx"')
    );
  });

  it('scaffolds index.html and auto-generates main.jsx if App.jsx exists and /src directory needs to be created', () => {
    const packageJson = {
      scripts: {
        build: 'vite build',
      },
      type: 'module',
    };
    mockVfs.writeFileSync('/vite.config.js', 'existing");');
    mockVfs.writeFileSync('/src/App.jsx', 'App component');

    // Simulate /src folder does not exist physically (mkdirSync mock)
    mockVfs.existsSync = vi.fn((path) => {
      if (path === '/src') return false;
      return path === '/src/App.jsx';
    });

    scaffoldMissingFiles(mockVfs, packageJson, onLogMock);

    expect(mockVfs.mkdirSync).toHaveBeenCalledWith('/src');
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith(
      '/src/main.jsx',
      expect.stringContaining("import App from './App.jsx';")
    );
  });
});
