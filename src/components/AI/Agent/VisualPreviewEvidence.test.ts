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
});
