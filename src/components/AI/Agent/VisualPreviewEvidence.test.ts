import { describe, expect, it } from 'vitest';
import { summarizeVisualPreviewEvidence } from './VisualPreviewEvidence';

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
});
