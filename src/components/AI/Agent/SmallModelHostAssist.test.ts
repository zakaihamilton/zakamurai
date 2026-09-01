import { describe, expect, it, vi } from 'vitest';
import {
  composeActionPriorContext,
  emitSmallModelHostGuidance,
  resolveSmallModelHostAssist,
} from './SmallModelHostAssist';

describe('SmallModelHostAssist', () => {
  it('narrows project scope and surfaces host guidance for recovery models', () => {
    const assist = resolveSmallModelHostAssist(
      'rewrite the entire codebase architecture across all files',
      'Qwen3.5-0.8B-q4f16_1-MLC',
      'project',
    );
    expect(assist.effectiveScope).toBe('file');
    expect(assist.assessment.forceSingleFile).toBe(true);
    expect(assist.assessment.guidance).toContain('one target file only');
    expect(assist.profile.maxContextFiles).toBe(2);
  });

  it('emits host guidance once and composes prior context without empty sections', () => {
    const onEvent = vi.fn();
    emitSmallModelHostGuidance(onEvent, {
      complexity: 'simple',
      forceSingleFile: true,
      guidance: 'Host assistance: write one file.',
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'context', message: 'Host assistance: write one file.' }),
    );
    expect(
      composeActionPriorContext({
        taskText: 'task',
        guidance: null,
        handoffContext: '',
        toolContext: 'tools',
      }),
    ).toBe('task\n\ntools');
  });
});
