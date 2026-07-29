import baseline from '@/../tests/performance/editor-baseline.json';
import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlighter';
import { shouldDeferEditorAnalysis } from './largeFile';

const line = 'const component = ({ value }) => value?.trim() ?? "";\n';
const editorFixture = line.repeat(1000);
const largeFixture = line.repeat(4000);

const medianDuration = (operation: () => void) => {
  const durations = Array.from({ length: 5 }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  const median = durations[2];
  if (median === undefined) throw new Error('expected median duration');
  return median;
};

const ceiling = (value: number) => value * (1 + baseline.tolerancePercent / 100);

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
