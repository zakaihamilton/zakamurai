import { describe, expect, it, vi } from 'vitest';
import {
  createInspectPreviewForLoop,
  inspectConsoleLogs,
  inspectFileSymbols,
  manageWorkspacePackages,
} from './ActionLoopInspect';

describe('ActionLoopInspect helpers', () => {
  it('filters console logs by level and query', () => {
    const files = {
      '.console.log': '[ERROR] boom\n[WARN] slow\nhello world',
    };
    expect(inspectConsoleLogs({ action: 'inspect_console_logs', level: 'error' }, files)).toContain(
      'boom',
    );
    expect(inspectConsoleLogs({ action: 'inspect_console_logs', query: 'hello' }, files)).toContain(
      'hello world',
    );
    expect(inspectConsoleLogs({ action: 'inspect_console_logs', level: 'warn' }, files)).toContain(
      'slow',
    );
    expect(inspectConsoleLogs({ action: 'inspect_console_logs' }, {})).toMatch(/No matching/);
  });

  it('outlines symbols and reports missing files', () => {
    expect(
      inspectFileSymbols(
        { action: 'get_file_symbols', path: 'src/App.jsx' },
        { 'src/App.jsx': 'export default function App() { return null; }' },
      ),
    ).toMatch(/App/);
    expect(() =>
      inspectFileSymbols({ action: 'get_file_symbols', path: 'missing.js' }, {}),
    ).toThrow(/File not found/);
    expect(inspectFileSymbols({ action: 'get_file_symbols' }, { '': '' })).toMatch(
      /File not found/,
    );
    expect(
      inspectFileSymbols({ action: 'get_file_symbols', path: 'empty.js' }, { 'empty.js': '' }),
    ).toMatch(/File not found/);
  });

  it('lists packages without mutating files when no update is needed', () => {
    const files = {
      'package.json': JSON.stringify({ dependencies: { react: '19.0.0' } }),
    };
    const result = manageWorkspacePackages({ action: 'manage_packages' }, files);
    expect(result.updatedPackageJson).toBeUndefined();
    expect(result.result).toContain('react');
    expect(
      manageWorkspacePackages({ action: 'manage_packages', query: 'unknown' }, files).result,
    ).toContain('react');
  });

  it('reuses an accepted preview inspection and recovers style-audit failures', async () => {
    const cached = createInspectPreviewForLoop({
      state: {
        inspectedPreview: true,
        previewInspectionAccepted: true,
        lastPreviewResult: '{"ok":true}',
      },
      files: {},
      previewInspectionRequired: true,
      resolvedStyleProfile: { accent: 'indigo' },
      applyCssModuleRecovery: () => [],
      context: { record: vi.fn() } as never,
      onEvent: vi.fn(),
      agentRole: 'coder',
    });
    expect(await cached(1)).toBe('{"ok":true}');

    const record = vi.fn();
    const applyCssModuleRecovery = vi.fn(() => ['src/App.module.css']);
    const inspectPreview = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'passed',
        elements: ['h1: Demo', 'button: Save'],
        screenshotCaptured: true,
        styleAudit: {
          issues: ['horizontal overflow'],
        },
      })
      .mockResolvedValueOnce({
        status: 'passed',
        elements: ['h1: Demo', 'button: Save'],
        screenshotCaptured: true,
        styleAudit: { issues: [] },
      });
    const inspect = createInspectPreviewForLoop({
      state: {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      },
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      inspectPreview,
      previewInspectionRequired: true,
      resolvedStyleProfile: { accent: 'indigo' },
      applyCssModuleRecovery,
      context: { record } as never,
      onEvent: vi.fn(),
      agentRole: 'coder',
    });
    const result = await inspect(2);
    expect(applyCssModuleRecovery).toHaveBeenCalledWith(2);
    expect(inspectPreview).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      'style_audit_repair',
      expect.objectContaining({ recovered: ['src/App.module.css'] }),
    );
    expect(result).not.toMatch(/insufficient/);
  });

  it('reports unavailable preview inspection when no inspector is provided', async () => {
    const inspect = createInspectPreviewForLoop({
      state: {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      },
      files: {},
      previewInspectionRequired: false,
      resolvedStyleProfile: null,
      applyCssModuleRecovery: () => [],
      context: { record: vi.fn() } as never,
      onEvent: vi.fn(),
      agentRole: 'coder',
    });
    expect(await inspect(1)).toMatch(/unavailable/);
  });

  it('records insufficient evidence when required inspection returns a non-object', async () => {
    const inspect = createInspectPreviewForLoop({
      state: {
        inspectedPreview: false,
        previewInspectionAccepted: false,
        lastPreviewResult: '',
      },
      files: {},
      inspectPreview: async () => 'not-an-object',
      previewInspectionRequired: true,
      resolvedStyleProfile: null,
      applyCssModuleRecovery: () => [],
      context: { record: vi.fn() } as never,
      onEvent: vi.fn(),
      agentRole: 'coder',
    });
    expect(await inspect(1)).toMatch(/insufficient/);
  });
});
