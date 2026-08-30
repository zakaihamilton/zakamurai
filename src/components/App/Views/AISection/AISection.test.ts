import { describe, expect, it } from 'vitest';
import {
  formatRunUsageSummary,
  getCompletedRunUsageSummary,
  groupReasoningEntries,
  keyReasoningEntries,
} from './AISection';
import {
  extractReasoningLabel,
  getReasoningEntryStatus,
  getReasoningGroupStatus,
  getRunStatus,
  normalizeReasoningViewType,
  stripReasoningLabel,
} from './AISectionReasoning';

describe('reasoning visual helpers', () => {
  it('defaults missing and unsupported reasoning views to the visual timeline', () => {
    expect(normalizeReasoningViewType(undefined)).toBe('visual');
    expect(normalizeReasoningViewType('unknown')).toBe('visual');
    expect(normalizeReasoningViewType('text')).toBe('text');
  });

  it('extracts phase labels and leaves the Markdown body intact', () => {
    expect(extractReasoningLabel('**Routing:** choosing a path')).toBe('Routing');
    expect(stripReasoningLabel('**Routing:** choosing a path')).toBe('choosing a path');
    expect(extractReasoningLabel('No phase label')).toBeNull();
    expect(stripReasoningLabel('No phase label')).toBe('No phase label');
  });

  it('assigns timeline statuses from event content and run state', () => {
    expect(getReasoningEntryStatus({ text: 'Tool failed', isLast: false, isRunning: true })).toBe(
      'error',
    );
    expect(getReasoningEntryStatus({ text: 'Reading files', isLast: true, isRunning: true })).toBe(
      'active',
    );
    expect(
      getReasoningEntryStatus({ text: 'Validation passed', isLast: false, isRunning: false }),
    ).toBe('success');

    const group = {
      step: 1,
      entries: [
        { text: 'Started', timestamp: '' },
        { text: 'Tool completed', timestamp: '' },
      ],
    };
    expect(getReasoningGroupStatus(group, true, true)).toBe('active');
    expect(getRunStatus(null, '', false)).toBe('waiting');
    expect(getRunStatus({ status: 'running' } as never, '', true)).toBe('running');
    expect(getRunStatus(null, '', true)).toBe('ready');
    expect(getRunStatus(null, 'The model failed', true)).toBe('error');
  });
});

describe('groupReasoningEntries', () => {
  it('groups consecutive step events beneath one step header and removes their repeated prefix', () => {
    expect(
      groupReasoningEntries([
        { timestamp: '20:39:24', text: '**Preparing workspace:** collecting project files…' },
        { timestamp: '20:39:24', text: '**Step 1:** Reviewing the request…' },
        { timestamp: '20:39:24', text: '**Step 1:** Requesting the next action…' },
        { timestamp: '20:39:32', text: '**Step 1 result:** `list_files` completed…' },
        { timestamp: '20:39:32', text: '**Step 2:** Reviewing the latest tool result…' },
      ]),
    ).toEqual([
      {
        step: null,
        entries: [
          { timestamp: '20:39:24', text: '**Preparing workspace:** collecting project files…' },
        ],
      },
      {
        step: 1,
        entries: [
          { timestamp: '20:39:24', text: 'Reviewing the request…' },
          { timestamp: '20:39:24', text: 'Requesting the next action…' },
          { timestamp: '20:39:32', text: '`list_files` completed…' },
        ],
      },
      {
        step: 2,
        entries: [{ timestamp: '20:39:32', text: 'Reviewing the latest tool result…' }],
      },
    ]);
  });
});

describe('keyReasoningEntries', () => {
  it('disambiguates repeated same-second entries with identical text', () => {
    const keyed = keyReasoningEntries([
      { timestamp: '07:36:34', text: '`write_file`' },
      { timestamp: '07:36:34', text: '`write_file`' },
    ]);

    expect(keyed.map((entry) => entry.renderKey)).toEqual([
      '07:36:34-`write_file`-0',
      '07:36:34-`write_file`-1',
    ]);
  });
});

describe('formatRunUsageSummary', () => {
  it('includes token coverage, tools, and reported performance metrics', () => {
    expect(
      formatRunUsageSummary({
        modelIds: ['model-a'],
        modelCalls: 2,
        outcomes: { success: 1, error: 1, aborted: 0 },
        promptTokens: 12,
        promptTokenCalls: 1,
        completionTokens: 4,
        completionTokenCalls: 1,
        totalMs: 250,
        timeToFirstTokenMs: 40,
        timeToFirstTokenCalls: 1,
        decodeTokensPerSecond: 20,
        decodeTokensPerSecondCalls: 1,
        toolCalls: { write_file: 1, read_file: 2 },
      }),
    ).toContain(
      '**Input tokens:** 12\n\n**Output tokens:** 4\n\n**Total tokens:** 16\n\n**Token reporting:** Input 1/2 calls reported · Output 1/2 calls reported',
    );
    expect(
      formatRunUsageSummary({
        modelIds: ['model-a'],
        modelCalls: 1,
        outcomes: { success: 1, error: 0, aborted: 0 },
        promptTokens: 1,
        promptTokenCalls: 1,
        completionTokens: 1,
        completionTokenCalls: 1,
        totalMs: 100,
        timeToFirstTokenMs: 20,
        timeToFirstTokenCalls: 1,
        decodeTokensPerSecond: 20,
        decodeTokensPerSecondCalls: 1,
        toolCalls: {},
      }),
    ).toContain('**Avg. first token:** 20 ms\n\n**Avg. generation speed:** 20 tokens/s');
    expect(
      formatRunUsageSummary({
        modelIds: [],
        modelCalls: 1,
        outcomes: { success: 1, error: 0, aborted: 0 },
        promptTokens: 0,
        promptTokenCalls: 0,
        completionTokens: 0,
        completionTokenCalls: 0,
        totalMs: 1,
        timeToFirstTokenMs: 0,
        timeToFirstTokenCalls: 0,
        decodeTokensPerSecond: 0,
        decodeTokensPerSecondCalls: 0,
        toolCalls: {},
      }),
    ).toContain('**Token reporting:** Input unavailable · Output unavailable');
  });

  it('hides the summary until the agent run is no longer running', () => {
    const usage = {
      modelIds: ['model-a'],
      modelCalls: 1,
      outcomes: { success: 1, error: 0, aborted: 0 },
      promptTokens: 12,
      promptTokenCalls: 1,
      completionTokens: 4,
      completionTokenCalls: 1,
      totalMs: 100,
      timeToFirstTokenMs: 20,
      timeToFirstTokenCalls: 1,
      decodeTokensPerSecond: 20,
      decodeTokensPerSecondCalls: 1,
      toolCalls: {},
    };
    expect(getCompletedRunUsageSummary('running', usage)).toBe('');
    expect(getCompletedRunUsageSummary('idle', usage)).toContain('Run summary');
  });
});
