export type PackageAction = 'list' | 'add' | 'remove';

export type PackageOperationInput = {
  action: PackageAction;
  packageName?: string;
  version?: string;
  isDev?: boolean;
};

export type PackageListResult = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

export type PackageOperationResult = {
  action: PackageAction;
  success: boolean;
  message: string;
  updatedPackageJson?: string;
  packages?: PackageListResult;
};

type PackageJsonShape = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

export function parsePackageJson(content: string): PackageJsonShape {
  try {
    return JSON.parse(content) as PackageJsonShape;
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }
}

export function handlePackageOperation(
  files: Record<string, string>,
  input: PackageOperationInput,
): PackageOperationResult {
  const packageJsonContent =
    files['package.json'] || '{\n  "dependencies": {},\n  "devDependencies": {}\n}\n';
  const pkg = parsePackageJson(packageJsonContent);

  const dependencies = pkg.dependencies || {};
  const devDependencies = pkg.devDependencies || {};

  if (input.action === 'list') {
    return {
      action: 'list',
      success: true,
      message: `Found ${Object.keys(dependencies).length} dependencies and ${Object.keys(devDependencies).length} devDependencies.`,
      packages: { dependencies, devDependencies },
    };
  }

  const name = input.packageName?.trim();
  if (!name) {
    return {
      action: input.action,
      success: false,
      message: 'Package name is required for add or remove operations.',
    };
  }

  if (input.action === 'add') {
    const ver = input.version?.trim() || 'latest';
    const targetSection = input.isDev ? 'devDependencies' : 'dependencies';

    if (input.isDev) {
      pkg.devDependencies = { ...devDependencies, [name]: ver };
    } else {
      pkg.dependencies = { ...dependencies, [name]: ver };
    }

    const updatedPackageJson = `${JSON.stringify(pkg, null, 2)}\n`;
    return {
      action: 'add',
      success: true,
      message: `Added ${name}@${ver} to ${targetSection}.`,
      updatedPackageJson,
      packages: {
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
      },
    };
  }

  if (input.action === 'remove') {
    const wasDep = Boolean(dependencies[name]);
    const wasDev = Boolean(devDependencies[name]);

    if (!wasDep && !wasDev) {
      return {
        action: 'remove',
        success: false,
        message: `Package "${name}" was not found in dependencies or devDependencies.`,
      };
    }

    delete dependencies[name];
    delete devDependencies[name];

    pkg.dependencies = dependencies;
    pkg.devDependencies = devDependencies;

    const updatedPackageJson = `${JSON.stringify(pkg, null, 2)}\n`;
    return {
      action: 'remove',
      success: true,
      message: `Removed ${name} from package.json.`,
      updatedPackageJson,
      packages: { dependencies, devDependencies },
    };
  }

  return {
    action: input.action,
    success: false,
    message: `Unsupported package action: ${String(input.action)}`,
  };
}
