import type { VfsLike } from '@/utils/compiler/types';

export type MutableVfsLike = VfsLike & {
  files: Record<string, string>;
};

/**
 * Creates a mutable in-memory VFS backed by the shared `files` object (not a copy).
 */
export function createMutableVfsLike(files: Record<string, string> = {}): MutableVfsLike {
  const isDirectory = (path: string): boolean => {
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
    return Object.keys(files).some(
      (key) => key.startsWith(`${normalized}/`) && key !== normalized,
    );
  };

  return {
    files,
    existsSync(path: string) {
      return Object.hasOwn(files, path) || isDirectory(path);
    },
    readFileSync(path: string) {
      if (!Object.hasOwn(files, path)) {
        throw new Error(`ENOENT: no such file ${path}`);
      }
      return files[path];
    },
    writeFileSync(path: string, content: string | Uint8Array) {
      files[path] = typeof content === 'string' ? content : new TextDecoder().decode(content);
    },
    readdirSync(path: string) {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of Object.keys(files)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },
    mkdirSync() {},
    unlinkSync(path: string) {
      delete files[path];
    },
    rmdirSync(path: string) {
      for (const key of Object.keys(files)) {
        if (key.startsWith(`${path}/`)) delete files[key];
      }
      delete files[path];
    },
  };
}

export function createMinimalVfsLike(
  overrides: Partial<VfsLike> & Pick<VfsLike, 'existsSync'>,
): VfsLike {
  return {
    readFileSync: () => '',
    readdirSync: () => [],
    writeFileSync: () => {},
    ...overrides,
  };
}
