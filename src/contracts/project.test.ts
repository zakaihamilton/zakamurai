import { describe, expect, it } from 'vitest';
import { analyzeProjectHealth, analyzeRuntimeCompatibility } from './project';

describe('project compatibility contracts', () => {
  it('recognizes a browser-buildable Vite project', () => {
    const report = analyzeProjectHealth({
      'package.json': JSON.stringify({
        scripts: { build: 'vite build' },
        dependencies: { react: '^19' },
      }),
      'index.html': '<div id="root"></div>',
    });
    expect(report.status).toBe('ready');
    expect(report.compatibility.browserBuild).toBe(true);
  });

  it('reports malformed manifests and native-looking dependencies', () => {
    const report = analyzeProjectHealth({
      'package.json': JSON.stringify({
        dependencies: { sharp: '^1.0.0' },
        scripts: { build: 'next build | tee out' },
      }),
    });
    expect(report.status).toBe('warnings');
    expect(report.items.map((item) => item.code)).toEqual(
      expect.arrayContaining(['unsupported-build-script', 'native-dependency']),
    );
  });

  it('handles plain browser files without a package manifest', () => {
    const report = analyzeRuntimeCompatibility({ 'index.html': '<h1>Hello</h1>' });
    expect(report.supported).toBe(true);
    expect(report.notes[0]).toContain('No package.json');
  });

  it('reports missing entry points and manifests without scripts', () => {
    expect(analyzeProjectHealth({}).items[0]?.code).toBe('missing-entry-point');
    const report = analyzeProjectHealth({ 'package.json': JSON.stringify({ name: 'plain' }) });
    expect(report.status).toBe('warnings');
    expect(report.items.map((item) => item.code)).toEqual(
      expect.arrayContaining(['missing-entry-point', 'no-build-script']),
    );
  });

  it('handles malformed JSON and non-build scripts', () => {
    const malformed = analyzeProjectHealth({ 'package.json': '{' });
    expect(malformed.status).toBe('blocked');
    expect(malformed.items[0]?.code).toBe('malformed-package-json');
    expect(analyzeProjectHealth({ 'package.json': 'null' }).status).toBe('blocked');

    const report = analyzeRuntimeCompatibility({
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }),
    });
    expect(report.scripts[0]).toMatchObject({ name: 'lint', supported: true });
    expect(report.browserBuild).toBe(false);
    expect(analyzeRuntimeCompatibility({ 'package.json': '[]' }).supported).toBe(false);

    const nativeReport = analyzeRuntimeCompatibility({
      'package.json': JSON.stringify({ dependencies: { sharp: '^1.0.0' } }),
    });
    expect(nativeReport.unsupportedDependencies).toEqual(['sharp']);
    expect(nativeReport.notes).toContain(
      'Some dependencies look like native or Node-only packages.',
    );
  });
});
