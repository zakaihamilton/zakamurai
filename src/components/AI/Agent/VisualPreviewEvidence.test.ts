import { describe, expect, it } from 'vitest';
import {
  summarizeVisualPreviewEvidence,
  visualPreviewInspectionFailure,
} from './VisualPreviewEvidence';

describe('summarizeVisualPreviewEvidence', () => {
  it('turns DOM evidence into deterministic visual-review signals', () => {
    expect(
      summarizeVisualPreviewEvidence({
        title: 'Demo',
        text: 'Main navigation content',
        elements: ['h1: Welcome', 'button: Get started', 'a: Learn more'],
        screenshotCaptured: true,
      }),
    ).toMatchObject({
      headings: ['h1: Welcome'],
      namedInteractiveElements: ['button: Get started', 'a: Learn more'],
      landmarks: expect.arrayContaining(['heading hierarchy', 'named interactive elements']),
      issues: [],
      screenshotCaptured: true,
    });
  });

  it('flags missing headings, unnamed controls, and runtime errors', () => {
    expect(
      summarizeVisualPreviewEvidence({ elements: ['button: '] }, [
        'ReferenceError: app is not defined',
      ]).issues,
    ).toEqual(
      expect.arrayContaining([
        'runtime errors reported',
        'no headings found in preview evidence',
        'interactive elements are missing accessible names',
      ]),
    );
  });

  it('rejects passed preview evidence containing runtime errors', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: ['main: Notes', 'h1: Notes', 'textarea: Note body'],
        screenshotCaptured: true,
        runtimeErrors: ['ReferenceError: handleKeyDown is not defined'],
      }),
    ).toContain('handleKeyDown is not defined');
  });

  it('preserves runtime diagnostics for failed preview inspections', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'failed',
        diagnostics: 'Preview build failed',
        runtimeErrors: ['ReferenceError: handleKeyDown is not defined'],
      }),
    ).toContain('handleKeyDown is not defined');
  });

  it('prioritizes a runtime diagnostic when the crashed preview has no landmarks', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: [],
        screenshotCaptured: false,
        runtimeErrors: ['ReferenceError: handleKeyDown is not defined'],
      }),
    ).toContain('handleKeyDown is not defined');
  });

  it('rejects passed previews that contain no rendered evidence or screenshot', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: [],
        screenshotCaptured: false,
      }),
    ).toContain('no DOM landmarks');
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: ['h1: Todo App'],
        screenshotCaptured: false,
      }),
    ).toContain('did not capture a screenshot');
  });

  it('rejects concrete computed-style audit failures', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: ['h1: Demo', 'button: Save'],
        screenshotCaptured: true,
        styleAudit: {
          horizontalOverflow: true,
          collapsedControls: [],
          missingExplicitColors: [],
          contrastFailures: [],
          unnamedControls: [],
          missingFocusVisible: false,
          issues: ['horizontal overflow'],
        },
      }),
    ).toContain('horizontal overflow');
  });

  it('does not reject a preview for advisory layout evidence alone', () => {
    expect(
      visualPreviewInspectionFailure({
        status: 'passed',
        elements: ['h1: Settings', 'input: Name', 'button: Save'],
        screenshotCaptured: true,
        styleAudit: {
          horizontalOverflow: false,
          collapsedControls: [],
          controlLayoutIssues: ['controls wrap unexpectedly in a wide row'],
          advisoryIssues: ['controls wrap unexpectedly'],
          missingExplicitColors: [],
          contrastFailures: [],
          unnamedControls: [],
          missingFocusVisible: false,
          issues: [],
        },
      }),
    ).toBeNull();
  });
});
