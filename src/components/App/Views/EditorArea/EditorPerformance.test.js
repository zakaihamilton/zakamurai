import baseline from '@/../tests/performance/editor-baseline.json';
import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlighter';
import { shouldDeferEditorAnalysis } from './largeFile';

const line = 'const component = ({ value }) => value?.trim() ?? "";\n';
const editorFixture = line.repeat(1000);
const largeFixture = line.repeat(4000);

const medianDuration = (operation) => {
  const durations = Array.from({ length: 5 }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return durations[2];
};

const ceiling = (value) => value * (1 + baseline.tolerancePercent / 100);

describe('editor performance baselines', () => {
  it('keeps highlighter work within the calibrated regression threshold', () => {
    const elapsed = medianDuration(() => highlightCode(editorFixture, 'src/App.jsx', {}));
    expect(elapsed).toBeLessThanOrEqual(ceiling(baseline.highlighterMedianMs));
  });

  it('keeps large-file deferral lightweight before editor rendering', () => {
    const elapsed = medianDuration(() => shouldDeferEditorAnalysis(largeFixture));
    expect(elapsed).toBeLessThanOrEqual(ceiling(baseline.largeFileGateMedianMs));
  });
});
