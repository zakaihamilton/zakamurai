import { describe, expect, it } from 'vitest';
import { handlePackageOperation } from './PackageManager';

describe('PackageManager', () => {
  const initialFiles = {
    'package.json': JSON.stringify(
      {
        name: 'test-app',
        dependencies: { react: '^19.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      null,
      2,
    ),
  };

  it('lists installed dependencies and devDependencies', () => {
    const res = handlePackageOperation(initialFiles, { action: 'list' });
    expect(res.success).toBe(true);
    expect(res.packages?.dependencies.react).toBe('^19.0.0');
    expect(res.packages?.devDependencies.typescript).toBe('^5.0.0');
  });

  it('adds a new package to dependencies', () => {
    const res = handlePackageOperation(initialFiles, {
      action: 'add',
      packageName: 'lucide-react',
      version: '^0.400.0',
    });
    expect(res.success).toBe(true);
    expect(res.message).toContain('Added lucide-react@^0.400.0');
    expect(res.updatedPackageJson).toContain('"lucide-react": "^0.400.0"');
  });

  it('removes an existing package', () => {
    const res = handlePackageOperation(initialFiles, {
      action: 'remove',
      packageName: 'react',
    });
    expect(res.success).toBe(true);
    expect(res.message).toContain('Removed react');
    expect(res.updatedPackageJson).not.toContain('"react"');
  });

  it('returns failure when removing a non-existent package', () => {
    const res = handlePackageOperation(initialFiles, {
      action: 'remove',
      packageName: 'nonexistent-pkg',
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('was not found');
  });
});
