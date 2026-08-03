import { isBrowserBundleCommand, parseBuildCommand } from '@/utils/compiler/browser-bundler';

export type RuntimeCompatibilityReport = {
  supported: boolean;
  browserBuild: boolean;
  scripts: Array<{ name: string; command: string; supported: boolean; reason?: string }>;
  unsupportedDependencies: string[];
  notes: string[];
};

export type ProjectHealthSeverity = 'error' | 'warning' | 'info';

export type ProjectHealthItem = {
  severity: ProjectHealthSeverity;
  code: string;
  message: string;
  path?: string;
};

export type ProjectHealthReport = {
  status: 'ready' | 'warnings' | 'blocked';
  items: ProjectHealthItem[];
  compatibility: RuntimeCompatibilityReport;
};

const PACKAGE_NAME = /^(@[^/]+\/[^/]+|[^/]+)$/;
const NATIVE_DEPENDENCY_HINT =
  /(?:^|[-_])(native|node|electron|sqlite|sharp|canvas|ffi|grpc)(?:$|[-_])/i;

const parsePackage = (files: Record<string, string>) => {
  const raw = files['package.json'];
  if (raw === undefined) return { packageJson: null, error: null };
  try {
    const packageJson = JSON.parse(raw) as Record<string, unknown>;
    if (!packageJson || Array.isArray(packageJson) || typeof packageJson !== 'object') {
      return { packageJson: null, error: 'package.json must contain an object.' };
    }
    return { packageJson, error: null };
  } catch (error) {
    return {
      packageJson: null,
      error: `package.json is malformed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export function analyzeRuntimeCompatibility(
  files: Record<string, string> = {},
): RuntimeCompatibilityReport {
  const { packageJson, error } = parsePackage(files);
  if (!packageJson) {
    return {
      supported: !error,
      browserBuild: false,
      scripts: [],
      unsupportedDependencies: [],
      notes: error
        ? [error]
        : ['No package.json found; plain browser files can still be previewed.'],
    };
  }

  const scripts =
    packageJson.scripts && typeof packageJson.scripts === 'object'
      ? Object.entries(packageJson.scripts as Record<string, unknown>)
          .filter(([, command]) => typeof command === 'string')
          .map(([name, command]) => {
            try {
              const parts = parseBuildCommand(command as string);
              const browserBuild =
                parts.length > 0 &&
                parts.every(([cmd, ...args]) => isBrowserBundleCommand(cmd, args));
              return {
                name,
                command: command as string,
                supported: browserBuild || name !== 'build',
                ...(browserBuild
                  ? {}
                  : {
                      reason:
                        name === 'build'
                          ? 'Build script is not a supported browser bundler command.'
                          : 'Script is parsed but may depend on unavailable runtime APIs.',
                    }),
              };
            } catch (parseError) {
              return {
                name,
                command: command as string,
                supported: false,
                reason: parseError instanceof Error ? parseError.message : String(parseError),
              };
            }
          })
      : [];
  const dependencyGroups = ['dependencies', 'devDependencies', 'optionalDependencies'];
  const unsupportedDependencies = dependencyGroups.flatMap((group) => {
    const values = packageJson[group];
    if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
    return Object.keys(values as Record<string, unknown>).filter(
      (name) => PACKAGE_NAME.test(name) && NATIVE_DEPENDENCY_HINT.test(name),
    );
  });
  const browserBuild = scripts.some((script) => script.name === 'build' && script.supported);
  const notes = [
    ...(browserBuild ? ['Build script is compatible with the browser bundler.'] : []),
    ...(unsupportedDependencies.length
      ? ['Some dependencies look like native or Node-only packages.']
      : []),
    ...(!scripts.length ? ['No package scripts were found.'] : []),
  ];
  return {
    supported: !error && !scripts.some((script) => script.name === 'build' && !script.supported),
    browserBuild,
    scripts,
    unsupportedDependencies: [...new Set(unsupportedDependencies)],
    notes,
  };
}

export function analyzeProjectHealth(files: Record<string, string> = {}): ProjectHealthReport {
  const items: ProjectHealthItem[] = [];
  const rawPackage = files['package.json'];
  let packageJson: Record<string, unknown> | null = null;
  if (rawPackage !== undefined) {
    try {
      const parsed = JSON.parse(rawPackage) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('package.json must contain an object.');
      }
      packageJson = parsed as Record<string, unknown>;
    } catch (error) {
      items.push({
        severity: 'error',
        code: 'malformed-package-json',
        path: 'package.json',
        message: `package.json cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const hasEntryPoint =
    Boolean(
      packageJson?.main ||
        packageJson?.module ||
        packageJson?.source ||
        packageJson?.exports ||
        files['index.html'] ||
        files['index.js'],
    ) ||
    Object.keys(files).some((path) => /(?:^|\/)(?:main|index|App)\.(?:js|jsx|ts|tsx)$/.test(path));
  if (!hasEntryPoint) {
    items.push({
      severity: 'warning',
      code: 'missing-entry-point',
      message: 'No package.json, index.html, or index.js entry point was found.',
    });
  }
  const compatibility = analyzeRuntimeCompatibility(files);
  if (compatibility.scripts.some((script) => script.name === 'build' && !script.supported)) {
    items.push({
      severity: 'warning',
      code: 'unsupported-build-script',
      path: 'package.json',
      message: 'The build script is not fully supported by the browser runtime.',
    });
  }
  for (const dependency of compatibility.unsupportedDependencies) {
    items.push({
      severity: 'warning',
      code: 'native-dependency',
      path: 'package.json',
      message: `Dependency ${dependency} may require Node.js or native modules.`,
    });
  }
  if (packageJson && !packageJson.scripts) {
    items.push({
      severity: 'info',
      code: 'no-build-script',
      path: 'package.json',
      message: 'No build script is defined; Zakamurai will use the project entry point.',
    });
  }
  return {
    status: items.some((item) => item.severity === 'error')
      ? 'blocked'
      : items.some((item) => item.severity === 'warning')
        ? 'warnings'
        : 'ready',
    items,
    compatibility,
  };
}
