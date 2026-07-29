export type VfsLike = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding?: string) => string;
  writeFileSync: (path: string, content: string | Uint8Array) => void;
  readdirSync: (path: string) => string[];
  mkdirSync?: (path: string, options?: { recursive?: boolean }) => void;
  unlinkSync?: (path: string) => void;
  rmdirSync?: (path: string) => void;
  reset?: () => void;
};

export type PackageJson = {
  name?: string;
  type?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  exports?: unknown;
  scripts?: Record<string, string>;
};

export type OnLog = (message: string) => void;
export type OnPhase = (phase: string) => void;

export type RunResult = {
  exitCode: number;
};

export type AlmostnodeContainer = {
  vfs: VfsLike;
  npm: {
    installFromPackageJson: (options: {
      includeDev?: boolean;
      onProgress?: (msg: string) => void;
    }) => Promise<void>;
  };
  runtime: {
    runFileAsync: (path: string) => Promise<unknown>;
  };
  run: (
    command: string,
    options: {
      env?: Record<string, string>;
      onStdout?: (data: { toString: () => string }) => void;
      onStderr?: (data: { toString: () => string }) => void;
    },
  ) => Promise<RunResult>;
  serverBridge?: {
    initServiceWorker: (options: { swUrl: string }) => Promise<void>;
    registerServer: (server: unknown, port: number) => void;
  };
  devServer?: unknown;
  teardown?: () => Promise<void>;
  destroy?: () => Promise<void>;
};

export type FolderTreeNode = {
  name: string;
  isDir?: boolean;
  type?: string;
  content?: string;
  children?: FolderTreeNode[];
};

export type LocalFsLike = {
  mode: string;
  rootHandle?: FileSystemDirectoryHandle;
};

export type EsbuildOutputFile = {
  path: string;
  contents: Uint8Array;
};

export type EsbuildBuildResult = {
  outputFiles: EsbuildOutputFile[];
};

export type EsbuildPlugin = {
  name: string;
  setup: (build: EsbuildBuild) => void;
};

export type EsbuildBuild = {
  onResolve: (
    options: { filter: RegExp },
    callback: (args: EsbuildResolveArgs) => EsbuildResolveResult | undefined,
  ) => void;
  onLoad: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: { path: string }) => EsbuildLoadResult,
  ) => void;
};

export type EsbuildResolveArgs = {
  path: string;
  importer?: string;
  resolveDir?: string;
};

export type EsbuildResolveResult = {
  path?: string;
  namespace?: string;
  external?: boolean;
  errors?: Array<{ text: string }>;
};

export type EsbuildLoadResult = {
  contents: string;
  loader: string;
  resolveDir: string;
};

export type EsbuildApi = {
  initialize: (options: { wasmModule: WebAssembly.Module; worker: boolean }) => Promise<void>;
  build: (options: Record<string, unknown>) => Promise<EsbuildBuildResult>;
};

export type CompilerDiagnostic = {
  message: string;
  location: { path: string; line: number; column: number } | null;
};
